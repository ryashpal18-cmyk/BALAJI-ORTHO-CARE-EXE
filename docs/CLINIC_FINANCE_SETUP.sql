-- Additive setup. Existing patient IDs, bills, receipts and BAOR numbers stay intact.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS workflow_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS workflow_data jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS public.clinic_finance_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_finance_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_finance_owner ON public.clinic_finance_requests;
CREATE POLICY clinic_finance_owner ON public.clinic_finance_requests FOR ALL TO authenticated
 USING(user_id=auth.uid() AND public.has_role(auth.uid(),'admin'))
 WITH CHECK(user_id=auth.uid() AND public.has_role(auth.uid(),'admin'));
GRANT SELECT,INSERT ON public.clinic_finance_requests TO authenticated;
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
NOTIFY pgrst,'reload schema';

CREATE TABLE IF NOT EXISTS public.clinic_settings(id uuid PRIMARY KEY REFERENCES auth.users(id),user_id uuid NOT NULL REFERENCES auth.users(id),catalog jsonb NOT NULL DEFAULT '[]'::jsonb,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_settings_owner ON public.clinic_settings;
CREATE POLICY clinic_settings_owner ON public.clinic_settings FOR ALL TO authenticated USING(id=auth.uid() AND user_id=auth.uid() AND public.has_role(auth.uid(),'admin')) WITH CHECK(id=auth.uid() AND user_id=auth.uid() AND public.has_role(auth.uid(),'admin'));
GRANT SELECT,INSERT,UPDATE ON public.clinic_settings TO authenticated;

-- Human-readable invoice numbers are separate from permanent record IDs.
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS invoice_number bigint GENERATED BY DEFAULT AS IDENTITY;
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoice_number_unique ON public.billing(invoice_number);
CREATE TABLE IF NOT EXISTS public.clinic_number_reservations(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),numbers jsonb NOT NULL);
ALTER TABLE public.clinic_number_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS number_owner ON public.clinic_number_reservations;
CREATE POLICY number_owner ON public.clinic_number_reservations FOR ALL TO authenticated USING(user_id=auth.uid() AND public.has_role(auth.uid(),'admin')) WITH CHECK(user_id=auth.uid() AND public.has_role(auth.uid(),'admin'));
GRANT SELECT,INSERT ON public.clinic_number_reservations TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.billing_invoice_number_seq TO authenticated;
CREATE OR REPLACE FUNCTION public.reserve_invoice_numbers(p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN RAISE EXCEPTION 'Administrator required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT numbers INTO result FROM public.clinic_number_reservations WHERE id=p_request AND user_id=auth.uid();
 IF FOUND THEN RETURN result; END IF;
 SELECT jsonb_agg(nextval(pg_get_serial_sequence('public.billing','invoice_number'))) INTO result FROM generate_series(1,32);
 INSERT INTO public.clinic_number_reservations VALUES(p_request,auth.uid(),result); RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reserve_invoice_numbers(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_invoice_numbers(uuid) TO authenticated;
ALTER TABLE public.fracture_cases ADD COLUMN IF NOT EXISTS workflow_data jsonb NOT NULL DEFAULT '{}'::jsonb;
NOTIFY pgrst,'reload schema';
