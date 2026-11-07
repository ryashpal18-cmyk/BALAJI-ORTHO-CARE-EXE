-- Data-integrity guards for billing writes and stale offline deletes.
-- Trigger installation does not scan or rewrite historical rows.
BEGIN;

-- Keep cancelled bills cancelled while preserving append-only refund/account-credit receipts.
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
 IF lower(coalesce(NEW.status,''))='cancelled' AND total<>0 THEN RAISE EXCEPTION 'Refund before cancelling'; END IF;
 NEW.status:=CASE WHEN lower(coalesce(NEW.status,''))='cancelled' THEN 'Cancelled' WHEN total>=greatest(NEW.amount-coalesce(NEW.discount,0),0) THEN 'Paid' WHEN total>0 THEN 'Partial' ELSE 'Pending' END;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_billing_payment_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 -- Compare integer cents so binary/client formatting cannot permit a fractional-cent overpayment.
 IF lower(coalesce(NEW.status,''))<>'cancelled'
    AND round(coalesce(NEW.amount_paid,0)*100) > round(coalesce(NEW.amount,0)*100)-round(coalesce(NEW.discount,0)*100) THEN
  RAISE EXCEPTION 'Payment cannot exceed bill amount after discount' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_billing_payment_limit ON public.billing;
CREATE TRIGGER zz_billing_payment_limit BEFORE INSERT OR UPDATE ON public.billing
FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_payment_limit();

-- New clients supply the cached updated_at. The row is locked before revision and reference checks.
CREATE OR REPLACE FUNCTION public.delete_record_authorized(
 p_table text,
 p_id uuid,
 p_expected_updated_at timestamptz,
 p_expected_row jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row jsonb; current_updated_at timestamptz; child record; has_reference boolean;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_table NOT IN ('patients','billing','appointments','prescriptions','medical_history','fracture_cases','fracture_xrays','physiotherapy_sessions','beds','xray_reports','hospitals','insurance_claims','patient_medicines','medicine_entries','invoice_medicine_mapping','medicines','cash_book_entries','cash_book_days','payments','booking_requests','branches','report_payments','sms_logs') THEN RAISE EXCEPTION 'Invalid delete target'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table) INTO old_row USING p_id;
 -- A retry after a previously committed delete remains idempotent.
 IF old_row IS NULL THEN RETURN true; END IF;

 IF p_expected_row IS NULL OR jsonb_typeof(p_expected_row)<>'object' OR p_expected_row='{}'::jsonb THEN
  IF p_table='patients' THEN RAISE EXCEPTION 'Patient delete revision is missing; refresh and archive instead' USING ERRCODE='40001'; END IF;
  RAISE EXCEPTION 'Delete revision is missing; refresh before deleting' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_expected_row) expected
   WHERE NOT old_row ? expected.key OR (old_row -> (expected.key)) IS DISTINCT FROM expected.value) THEN
  RAISE EXCEPTION 'Delete conflict: cloud record changed; refresh before deleting' USING ERRCODE='40001';
 END IF;
 IF p_expected_updated_at IS NOT NULL THEN
  current_updated_at:=nullif(old_row->>'updated_at','')::timestamptz;
  IF current_updated_at IS NULL OR current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'Delete conflict: cloud record changed; refresh before deleting' USING ERRCODE='40001';
  END IF;
 END IF;

 IF p_table='patients' THEN
  -- Include every present public child/clinical/financial table with a patient_id column.
  FOR child IN
   SELECT c.oid::regclass::text AS relation_name
   FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attname='patient_id'
     AND a.attnum>0 AND NOT a.attisdropped
  LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE patient_id=$1)',child.relation_name)
    INTO has_reference USING p_id;
   IF has_reference THEN
    RAISE EXCEPTION 'Patient has clinical or financial references; archive instead of deleting' USING ERRCODE='23514';
   END IF;
  END LOOP;
  IF jsonb_typeof(old_row#>'{workflow_data,account}')='array'
     AND jsonb_array_length(old_row#>'{workflow_data,account}')>0 THEN
   RAISE EXCEPTION 'Patient has account history; archive instead of deleting' USING ERRCODE='23514';
  END IF;
 END IF;

 INSERT INTO public.deleted_records_log(table_name,record_id,record_data,deleted_by)
 VALUES(p_table,p_id,old_row,auth.uid());
 EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING p_id;
 RETURN true;
END $$;

-- Preserve old signatures only as safe compatibility shims. Existing rows cannot
-- be deleted without the expected locked snapshot supplied by a current client.
CREATE OR REPLACE FUNCTION public.delete_record_authorized(p_table text,p_id uuid,p_expected_updated_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN public.delete_record_authorized(p_table,p_id,p_expected_updated_at,NULL);
END $$;
CREATE OR REPLACE FUNCTION public.delete_record_authorized(p_table text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN public.delete_record_authorized(p_table,p_id,NULL,NULL);
END $$;
REVOKE ALL ON FUNCTION public.delete_record_authorized(text,uuid,timestamptz,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_record_authorized(text,uuid,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_record_authorized(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_record_authorized(text,uuid,timestamptz,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_record_authorized(text,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_record_authorized(text,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
