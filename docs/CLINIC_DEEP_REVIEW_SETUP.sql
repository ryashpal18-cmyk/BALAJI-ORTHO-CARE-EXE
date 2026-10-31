CREATE OR REPLACE FUNCTION public.merge_bill_receipts() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE history jsonb; event jsonb; delta numeric; old_paid numeric; total numeric;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.payment_history IS NULL THEN
     NEW.payment_history := CASE WHEN NEW.amount_paid=0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
       'id',gen_random_uuid(),'amount',NEW.amount_paid,'paid_at',coalesce(NEW.created_at,now()),'payment_mode',coalesce(NEW.payment_mode,'Cash'))) END;
   END IF;
 ELSE
   old_paid := OLD.amount_paid;
   history := coalesce(OLD.payment_history, CASE WHEN old_paid=0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
     'id','legacy-'||OLD.id,'amount',old_paid,'paid_at',OLD.created_at,'payment_mode',coalesce(OLD.payment_mode,'Cash'),'legacy',true)) END);
   IF NEW.payment_history IS NOT DISTINCT FROM OLD.payment_history THEN
     delta := NEW.amount_paid-old_paid;
     IF delta<>0 THEN history:=history||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'amount',delta,'paid_at',now(),'payment_mode',coalesce(NEW.payment_mode,'Cash'))); END IF;
   ELSE
     IF jsonb_typeof(NEW.payment_history)<>'array' THEN RAISE EXCEPTION 'Invalid receipt ledger'; END IF;
     FOR event IN SELECT value FROM jsonb_array_elements(NEW.payment_history) LOOP
       IF EXISTS (SELECT 1 FROM jsonb_array_elements(history) e WHERE e->>'id'=event->>'id'
         AND ((e->>'amount')::numeric IS DISTINCT FROM (event->>'amount')::numeric
           OR e->>'payment_mode' IS DISTINCT FROM event->>'payment_mode'
           OR (e->>'paid_at')::timestamptz IS DISTINCT FROM (event->>'paid_at')::timestamptz)) THEN
         RAISE EXCEPTION 'Receipt correction conflict: refresh and review payment mode' USING ERRCODE='23514';
       END IF;
       IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(history) e WHERE e->>'id'=event->>'id') THEN
         history:=history||jsonb_build_array(event);
       END IF;
     END LOOP;
   END IF;
   NEW.payment_history:=history;
 END IF;
 IF jsonb_typeof(NEW.payment_history)<>'array' THEN RAISE EXCEPTION 'Invalid receipt ledger'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payment_history) e WHERE e->>'id' IS NULL OR e->>'amount' IS NULL OR e->>'paid_at' IS NULL) THEN RAISE EXCEPTION 'Incomplete receipt'; END IF;
 SELECT coalesce(sum((e->>'amount')::numeric),0) INTO total FROM jsonb_array_elements(NEW.payment_history) e;
 IF total<0 OR total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid paid balance'; END IF;
 NEW.amount_paid:=total;
 IF NEW.status='Cancelled' AND total<>0 THEN RAISE EXCEPTION 'Refund before cancelling'; END IF;
 NEW.status:=CASE WHEN NEW.status='Cancelled' THEN 'Cancelled' WHEN total>=greatest(NEW.amount-coalesce(NEW.discount,0),0) THEN 'Paid' WHEN total>0 THEN 'Partial' ELSE 'Pending' END;
 RETURN NEW;
END $$;


-- Follow-up review: additive guards. No historical record is rewritten/deleted.
-- A shared transaction lock orders finance changes and cash-day closing.
CREATE OR REPLACE FUNCTION public.clinic_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d date; r jsonb; previous jsonb; next_row jsonb; prior_row jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('clinic-finance-write',0));
 IF TG_OP='DELETE' THEN next_row=to_jsonb(OLD); ELSE next_row=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' THEN prior_row=to_jsonb(OLD); END IF;
 IF TG_TABLE_NAME='patients' THEN
  IF TG_OP='DELETE' AND (EXISTS(SELECT 1 FROM public.billing WHERE patient_id=OLD.id) OR jsonb_array_length(coalesce(OLD.workflow_data->'account','[]'))>0) THEN RAISE EXCEPTION 'Archive patients with financial history; do not delete'; END IF;
 ELSIF TG_TABLE_NAME='billing' THEN
  IF TG_OP='DELETE' AND (coalesce(OLD.amount_paid,0)<>0 OR jsonb_array_length(coalesce(OLD.payment_history,'[]'))>0) THEN RAISE EXCEPTION 'Preserve receipt history; use refund and cancel'; END IF;
  IF TG_OP='UPDATE' AND lower(coalesce(OLD.status,''))='cancelled' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.discount IS DISTINCT FROM OLD.discount OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid) THEN RAISE EXCEPTION 'Cancelled bill cannot be edited or collected'; END IF;
  IF TG_OP<>'DELETE' AND NEW.status='Cancelled' AND coalesce(NEW.amount_paid,0)<>0 THEN RAISE EXCEPTION 'Refund before cancelling'; END IF;
  IF TG_OP='UPDATE' AND NEW.amount_paid IS DISTINCT FROM OLD.amount_paid AND NEW.payment_history IS NOT DISTINCT FROM OLD.payment_history THEN RAISE EXCEPTION 'Receipt required for payment change'; END IF;
  IF TG_OP<>'DELETE' THEN
   IF (TG_OP='INSERT' OR next_row->'payment_history' IS DISTINCT FROM prior_row->'payment_history') AND NEW.payment_history IS NOT NULL AND (SELECT coalesce(sum((e->>'amount')::numeric),0) FROM jsonb_array_elements(NEW.payment_history) e) IS DISTINCT FROM coalesce(NEW.amount_paid,0) THEN RAISE EXCEPTION 'Receipt total does not match paid'; END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(coalesce(next_row->'payment_history','[]')) LOOP
    IF TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(prior_row->'payment_history','[]')) e WHERE e=r) THEN
     d=(nullif(r->>'paid_at','')::timestamptz AT TIME ZONE 'Asia/Kolkata')::date;
     IF EXISTS(SELECT 1 FROM public.cash_book_days WHERE entry_date=d AND status='closed') THEN RAISE EXCEPTION 'Reopen cash day before changing receipt'; END IF;
    END IF;
   END LOOP;
   IF TG_OP='UPDATE' THEN
    FOR r IN SELECT value FROM jsonb_array_elements(coalesce(prior_row->'payment_history','[]')) LOOP
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(next_row->'payment_history','[]')) e WHERE e=r) THEN RAISE EXCEPTION 'Receipt history is append-only'; END IF;
    END LOOP;
   END IF;
  END IF;
  IF TG_OP<>'UPDATE' OR next_row->'amount' IS DISTINCT FROM prior_row->'amount' OR next_row->'discount' IS DISTINCT FROM prior_row->'discount' OR next_row->'amount_paid' IS DISTINCT FROM prior_row->'amount_paid' THEN
   d=(nullif(next_row->>'created_at','')::timestamptz AT TIME ZONE 'Asia/Kolkata')::date;
   -- A later receipt may change paid on an old bill without changing original billing.
   IF TG_OP<>'UPDATE' OR next_row->'amount' IS DISTINCT FROM prior_row->'amount' OR next_row->'discount' IS DISTINCT FROM prior_row->'discount' OR (coalesce(next_row->'payment_history','[]')=coalesce(prior_row->'payment_history','[]')) THEN
    IF EXISTS(SELECT 1 FROM public.cash_book_days WHERE entry_date=d AND status='closed') THEN RAISE EXCEPTION 'Reopen cash day before changing bill'; END IF;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='cash_book_entries' THEN
  FOR d IN SELECT DISTINCT value::date FROM jsonb_array_elements_text(jsonb_build_array(next_row->>'entry_date',prior_row->>'entry_date')) WHERE value IS NOT NULL LOOP
   IF EXISTS(SELECT 1 FROM public.cash_book_days WHERE entry_date=d AND status='closed') THEN RAISE EXCEPTION 'Reopen cash day before changing entry'; END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clinic_write_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clinic_write_guard() TO authenticated;
DROP TRIGGER IF EXISTS clinic_deep_billing_guard ON public.billing;
CREATE TRIGGER clinic_deep_billing_guard BEFORE INSERT OR UPDATE OR DELETE ON public.billing FOR EACH ROW EXECUTE FUNCTION public.clinic_write_guard();
DROP TRIGGER IF EXISTS clinic_deep_patient_guard ON public.patients;
CREATE TRIGGER clinic_deep_patient_guard BEFORE DELETE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.clinic_write_guard();
DROP TRIGGER IF EXISTS clinic_deep_cash_guard ON public.cash_book_entries;
CREATE TRIGGER clinic_deep_cash_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cash_book_entries FOR EACH ROW EXECUTE FUNCTION public.clinic_write_guard();
DROP TRIGGER IF EXISTS clinic_deep_day_guard ON public.cash_book_days;
CREATE TRIGGER clinic_deep_day_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cash_book_days FOR EACH ROW EXECUTE FUNCTION public.clinic_write_guard();

CREATE OR REPLACE FUNCTION public.clinic_physio_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE course text; BEGIN
 course=coalesce(NEW.fracture_case_id::text,'plan:'||coalesce(NEW.exercise_plan,''));
 PERFORM pg_advisory_xact_lock(hashtextextended('physio:'||NEW.patient_id::text||':'||course,0));
 IF NEW.session_number IS NULL OR NEW.total_sessions IS NULL OR NEW.pain_scale IS NULL OR NEW.session_number<1 OR NEW.total_sessions<NEW.session_number OR NEW.pain_scale<0 OR NEW.pain_scale>10 THEN RAISE EXCEPTION 'Invalid physio session values'; END IF;
 IF EXISTS(SELECT 1 FROM public.physiotherapy_sessions r WHERE r.id<>NEW.id AND r.patient_id=NEW.patient_id AND r.session_number=NEW.session_number AND coalesce(r.fracture_case_id::text,'plan:'||coalesce(r.exercise_plan,''))=course) THEN RAISE EXCEPTION 'Physio session already exists for this course'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clinic_physio_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clinic_physio_guard() TO authenticated;
DROP TRIGGER IF EXISTS clinic_deep_physio_guard ON public.physiotherapy_sessions;
CREATE TRIGGER clinic_deep_physio_guard BEFORE INSERT OR UPDATE ON public.physiotherapy_sessions FOR EACH ROW EXECUTE FUNCTION public.clinic_physio_guard();

CREATE OR REPLACE FUNCTION public.save_clinic_finance(p_request uuid,p_items jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE item jsonb; m jsonb; patch jsonb; target uuid; old_bill public.billing; old_patient public.patients; n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Cloud administrator required' USING ERRCODE='42501'; END IF;
 -- Serialize retries of the same request, including concurrent requests from the same client.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 IF EXISTS(SELECT 1 FROM public.clinic_finance_requests WHERE id=p_request AND user_id=auth.uid()) THEN RETURN true; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>450 THEN RAISE EXCEPTION 'Invalid finance transaction'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  m=item->'mutation';patch=m->'payload';target=coalesce(m->>'rowId',m->>'tempId')::uuid;
  IF m->>'table'='billing' AND m->>'op'='update' THEN
   SELECT * INTO old_bill FROM public.billing WHERE id=target FOR UPDATE;
   IF m ? 'expectedPatient' AND old_bill.patient_id IS DISTINCT FROM (m->>'expectedPatient')::uuid THEN RAISE EXCEPTION 'Patient relation changed';END IF;
   IF NOT FOUND OR old_bill.amount_paid IS DISTINCT FROM (m->>'expectedPaid')::numeric THEN RAISE EXCEPTION 'Payment changed; reopen bill'; END IF;
   IF patch ? 'amount_paid' OR patch->>'status'='Cancelled' THEN
    IF NOT (m ? 'expectedBill') OR jsonb_typeof(m->'expectedBill')<>'object' THEN RAISE EXCEPTION 'Bill revision required; review queued finance with current bill'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(m->'expectedBill') e WHERE (to_jsonb(old_bill)->e.key) IS DISTINCT FROM e.value) THEN RAISE EXCEPTION 'Bill changed; reopen bill'; END IF;
    IF (patch->>'amount_paid')::numeric>old_bill.amount_paid AND (patch->>'amount_paid')::numeric>old_bill.amount-coalesce(old_bill.discount,0) THEN RAISE EXCEPTION 'Payment exceeds current bill net'; END IF;
   END IF;
   IF patch ? 'amount_paid' AND ((patch->>'amount_paid')::numeric<0 OR jsonb_typeof(patch->'payment_history')<>'array') THEN RAISE EXCEPTION 'Invalid receipt history'; END IF;
   IF patch->>'status'='Cancelled' AND coalesce((patch->>'amount_paid')::numeric,old_bill.amount_paid)<>0 THEN RAISE EXCEPTION 'Refund before cancelling'; END IF;
   UPDATE public.billing SET amount_paid=coalesce((patch->>'amount_paid')::numeric,amount_paid),payment_history=coalesce(patch->'payment_history',payment_history),payment_mode=coalesce(patch->>'payment_mode',payment_mode),status=coalesce(patch->>'status',status),workflow_data=coalesce(patch->'workflow_data',workflow_data),patient_id=coalesce((patch->>'patient_id')::uuid,patient_id),updated_at=now() WHERE id=target;
  ELSIF m->>'table'='patients' AND m->>'op'='update' THEN
   SELECT * INTO old_patient FROM public.patients WHERE id=target FOR UPDATE;
   IF NOT FOUND OR old_patient.workflow_data IS DISTINCT FROM m->'expectedWorkflow' THEN RAISE EXCEPTION 'Advance or patient preferences changed; review conflict'; END IF;
   IF (SELECT coalesce(sum((e->>'amount')::numeric),0) FROM jsonb_array_elements(coalesce(patch->'workflow_data'->'account','[]'::jsonb)) e)<0 THEN RAISE EXCEPTION 'Insufficient advance credit'; END IF;
   UPDATE public.patients SET workflow_data=patch->'workflow_data',updated_at=now() WHERE id=target;
  ELSIF m->>'table' IN ('appointments','prescriptions','physiotherapy_sessions','xray_reports','fracture_cases','fracture_xrays','beds','insurance_claims','patient_medicines','medical_history') AND m->>'op'='update' AND patch ? 'patient_id' THEN
   EXECUTE format('UPDATE public.%I SET patient_id=$1 WHERE id=$2 AND patient_id=$3',m->>'table') USING (patch->>'patient_id')::uuid,target,(m->>'expectedPatient')::uuid;
   GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'Patient relation changed';END IF;
  ELSIF m->>'table'='cash_book_entries' AND m->>'op'='insert' THEN
   IF EXISTS(SELECT 1 FROM public.cash_book_days WHERE entry_date=(patch->>'entry_date')::date AND status='closed') THEN RAISE EXCEPTION 'Reopen cash day first'; END IF;
   INSERT INTO public.cash_book_entries(id,entry_date,entry_type,amount,party_name,note,created_by,created_at)
   VALUES(target,(patch->>'entry_date')::date,patch->>'entry_type',(patch->>'amount')::numeric,patch->>'party_name',patch->>'note',patch->>'created_by',(patch->>'created_at')::timestamptz);
  ELSIF m->>'table'='audit_logs' AND m->>'op'='insert' THEN
   PERFORM public.append_audit_event(target,patch);
  ELSE RAISE EXCEPTION 'Unsupported finance operation';
  END IF;
 END LOOP;
 INSERT INTO public.clinic_finance_requests(id,user_id) VALUES(p_request,auth.uid());
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.save_clinic_finance(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_clinic_finance(uuid,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_record_authorized(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_record_authorized(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
