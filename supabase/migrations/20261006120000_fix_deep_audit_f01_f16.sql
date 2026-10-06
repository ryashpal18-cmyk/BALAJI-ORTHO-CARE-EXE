-- Follow-up audit F01-F16. Apply after 20261005150000, before distributing the EXE.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_access_patient(p_patient uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(),'admin') OR (p_patient IS NULL AND EXISTS (SELECT 1 FROM public.staff_access WHERE user_id=auth.uid() AND enabled AND allowed_branches IS NULL AND public.has_role(auth.uid(),'staff'))) OR EXISTS (
  SELECT 1 FROM public.patients p WHERE p.id=p_patient AND public.can_use_branch(p.branch_id)
  AND public.can_use_pages(ARRAY['*'])
 ); $$;
CREATE OR REPLACE FUNCTION public.can_use_clinic_cashbook() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(),'admin') OR EXISTS (
  SELECT 1 FROM public.staff_access WHERE user_id=auth.uid() AND enabled AND allowed_branches IS NULL
   AND public.has_role(auth.uid(),'staff') AND '/daily-cash-book'=ANY(allowed_pages)
 ); $$;
REVOKE ALL ON FUNCTION public.can_access_patient(uuid), public.can_use_clinic_cashbook() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_patient(uuid), public.can_use_clinic_cashbook() TO authenticated;
-- Missing legacy table referenced by PatientProfile; create only if not already deployed.
CREATE TABLE IF NOT EXISTS public.patient_medicines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
 medicine_id uuid REFERENCES public.medicines(id), medicine_name text, dosage text, duration text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_medicines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_medicines_staff ON public.patient_medicines;
CREATE POLICY patient_medicines_staff ON public.patient_medicines FOR ALL TO authenticated
 USING (public.can_use_pages(ARRAY['/patient-medicine','/opd'])) WITH CHECK (public.can_use_pages(ARRAY['/patient-medicine','/opd']));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['prescriptions','medical_history','fracture_cases','fracture_xrays','physiotherapy_sessions','beds','xray_reports','insurance_claims','patient_medicines'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS patch_patient_branch ON public.%I',t);
  EXECUTE format('CREATE POLICY patch_patient_branch ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_patient(patient_id)) WITH CHECK (public.can_access_patient(patient_id))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['cash_book_days','cash_book_entries'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS patch_clinic_cashbook ON public.%I',t);
  EXECUTE format('CREATE POLICY patch_clinic_cashbook ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_clinic_cashbook()) WITH CHECK (public.can_use_clinic_cashbook())',t);
 END LOOP;
END $$;
-- These child records inherit the bill's branch. Use the row visible through billing's RLS.
DROP POLICY IF EXISTS patch_bill_branch ON public.payments;
CREATE POLICY patch_bill_branch ON public.payments AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.billing b WHERE b.id=billing_id)) WITH CHECK (EXISTS(SELECT 1 FROM public.billing b WHERE b.id=billing_id));
-- Records without a reliable branch relationship are clinic-wide, never exposed to branch-restricted staff.
CREATE OR REPLACE FUNCTION public.has_clinic_scope() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM staff_access WHERE user_id=auth.uid() AND enabled AND allowed_branches IS NULL AND public.has_role(auth.uid(),'staff')); $$;
REVOKE ALL ON FUNCTION public.has_clinic_scope() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.has_clinic_scope() TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['report_payments','booking_requests','sms_logs','audit_logs','medicine_entries','invoice_medicine_mapping'] LOOP
  IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('DROP POLICY IF EXISTS patch_clinic_read ON public.%I',t);
  EXECUTE format('CREATE POLICY patch_clinic_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.has_clinic_scope())',t);
 END LOOP;
END $$;
-- Server-side authorization + idempotent acknowledgement: absent row is safe ONLY after admin verification.
CREATE OR REPLACE FUNCTION public.delete_record_authorized(p_table text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_table NOT IN ('patients','billing','appointments','prescriptions','medical_history','fracture_cases','fracture_xrays','physiotherapy_sessions','beds','xray_reports','hospitals','insurance_claims','patient_medicines','medicine_entries','invoice_medicine_mapping','medicines','cash_book_entries','cash_book_days','payments','booking_requests','branches','report_payments','sms_logs') THEN RAISE EXCEPTION 'Invalid delete target'; END IF;
 EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING p_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_record_authorized(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_record_authorized(text,uuid) TO authenticated;
-- Audit writers never need the ability to read the global audit log. Verified caller supplies actor identity.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id uuid;
CREATE OR REPLACE FUNCTION public.append_audit_event(p_id uuid,p_event jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid;
BEGIN
 IF NOT public.can_use_pages(ARRAY['*']) THEN RAISE EXCEPTION 'Active staff required' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR nullif(p_event->>'action','') IS NULL OR nullif(p_event->>'module','') IS NULL THEN RAISE EXCEPTION 'Invalid audit event'; END IF;
 SELECT actor_user_id INTO existing FROM public.audit_logs WHERE id=p_id;
 IF FOUND THEN
  IF existing IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Audit identity conflict'; END IF;
  RETURN true;
 END IF;
 INSERT INTO public.audit_logs(id,actor_user_id,actor_name,actor_role,action,module,record_id,description)
 VALUES(p_id,auth.uid(),coalesce((SELECT display_name FROM public.staff_access WHERE user_id=auth.uid()),auth.uid()::text),
 CASE WHEN public.has_role(auth.uid(),'admin') THEN 'admin' ELSE 'staff' END,p_event->>'action',p_event->>'module',p_event->>'record_id',p_event->>'description');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.append_audit_event(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_audit_event(uuid,jsonb) TO authenticated;
-- Audit is append-only even if a client bypasses the application.
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS patch_audit_insert ON public.audit_logs;
-- Closed days are immutable for staff. Admin reopening must carry an explanation; server owns audit fields.
CREATE OR REPLACE FUNCTION public.guard_cashbook_day() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='closed' AND NEW.status='closed' AND
  (NEW.physical_cash,NEW.calculated_closing,NEW.difference,NEW.remarks) IS NOT DISTINCT FROM (OLD.physical_cash,OLD.calculated_closing,OLD.difference,OLD.remarks) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator must reopen closed day'; END IF;
  IF NEW.status='open' THEN
   IF nullif(trim(NEW.reopen_reason),'') IS NULL THEN RAISE EXCEPTION 'Reopen reason required'; END IF;
   NEW.reopened_by:=auth.uid()::text; NEW.reopened_at:=now(); NEW.reopen_count:=OLD.reopen_count+1;
  ELSE RAISE EXCEPTION 'Reopen the day before changing it'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='open' AND NOT public.has_role(auth.uid(),'admin') AND
  (NEW.reopened_by,NEW.reopened_at,NEW.reopen_reason,NEW.reopen_count) IS DISTINCT FROM (OLD.reopened_by,OLD.reopened_at,OLD.reopen_reason,OLD.reopen_count)
 THEN RAISE EXCEPTION 'Reopen audit fields are protected'; END IF;
 IF NEW.status='closed' AND (TG_OP='INSERT' OR OLD.status<>'closed') THEN NEW.closed_by:=auth.uid()::text; NEW.closed_at:=now(); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_cashbook_day ON public.cash_book_days;
CREATE TRIGGER guard_cashbook_day BEFORE INSERT OR UPDATE ON public.cash_book_days FOR EACH ROW EXECUTE FUNCTION public.guard_cashbook_day();
-- Storage access follows active staff, page and patient/branch scope. Legacy unscoped paths require clinic-wide access.
CREATE OR REPLACE FUNCTION public.can_use_clinical_file(p_bucket text,p_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pages text[]; patient uuid; prefix text;
BEGIN
 IF public.has_role(auth.uid(),'admin') THEN RETURN true; END IF;
 pages:=CASE p_bucket WHEN 'invoices' THEN ARRAY['/billing','/daily-cash-book'] WHEN 'prescriptions' THEN ARRAY['/prescription','/opd'] WHEN 'xray-files' THEN ARRAY['/reports','/ortho'] WHEN 'reports' THEN ARRAY['/reports','/ortho'] ELSE ARRAY[]::text[] END;
 IF NOT public.can_use_pages(pages) THEN RETURN false; END IF;
 IF public.has_clinic_scope() THEN RETURN true; END IF;
 prefix:=split_part(p_name,'/',1);
 IF prefix !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 patient:=prefix::uuid;
 RETURN public.can_access_patient(patient);
END $$;
REVOKE ALL ON FUNCTION public.can_use_clinical_file(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_use_clinical_file(text,text) TO authenticated;
DROP POLICY IF EXISTS patch_clinical_storage ON storage.objects;
CREATE POLICY patch_clinical_storage ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.can_use_clinical_file(bucket_id,name)) WITH CHECK(public.can_use_clinical_file(bucket_id,name));
-- Existing public invoice sharing must not bypass disabled-user access restrictions.
UPDATE storage.buckets SET public=false WHERE id IN ('invoices','prescriptions','reports','xray-files');
DROP POLICY IF EXISTS "Public can view invoices" ON storage.objects;
COMMIT;
