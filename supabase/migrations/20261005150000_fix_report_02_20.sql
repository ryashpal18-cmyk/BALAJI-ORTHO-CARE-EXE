-- Fixes 2-20. Apply after the project's existing migrations, before installing the patched app.
BEGIN;
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS payment_history jsonb;
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.staff_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  allowed_pages text[] NOT NULL DEFAULT '{}',
  allowed_branches uuid[], -- NULL = clinic-wide; [] = no branch. Admin can restrict IDs.
  enabled boolean NOT NULL DEFAULT true
);
ALTER TABLE public.staff_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_access_read ON public.staff_access;
CREATE POLICY staff_access_read ON public.staff_access FOR SELECT TO authenticated
 USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS staff_access_admin ON public.staff_access;
CREATE POLICY staff_access_admin ON public.staff_access FOR ALL TO authenticated
 USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.can_use_pages(p_pages text[]) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(), 'admin') OR EXISTS (
   SELECT 1 FROM public.staff_access WHERE user_id=auth.uid() AND enabled
   AND public.has_role(auth.uid(), 'staff') AND ('*'=ANY(p_pages) OR allowed_pages && p_pages)
 ); $$;
CREATE OR REPLACE FUNCTION public.can_use_branch(p_branch uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(), 'admin') OR EXISTS (
   SELECT 1 FROM public.staff_access WHERE user_id=auth.uid() AND enabled
   AND (allowed_branches IS NULL OR p_branch=ANY(allowed_branches))
 ); $$;
REVOKE ALL ON FUNCTION public.can_use_pages(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_use_pages(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_branch(uuid) TO authenticated;
-- Attribute pre-branch rows to the existing main branch without inventing a new location.
DO $$ DECLARE main_id uuid; BEGIN
 SELECT id INTO main_id FROM public.branches ORDER BY created_at, id LIMIT 1;
 IF main_id IS NOT NULL THEN
  UPDATE public.patients SET branch_id=main_id WHERE branch_id IS NULL;
  UPDATE public.billing b SET branch_id=p.branch_id FROM public.patients p WHERE b.patient_id=p.id AND b.branch_id IS NULL;
  UPDATE public.appointments a SET branch_id=p.branch_id FROM public.patients p WHERE a.patient_id=p.id AND a.branch_id IS NULL;
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.patients') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.patients;
   CREATE POLICY patch_page_access ON public.patients AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/dashboard','/opd','/appointments','/billing','/due-amount','/ortho','/reports','/physiotherapy','/prescription','/patient-medicine','/whatsapp','/insurance-claims','/booking-requests']::text[]) AND public.can_use_branch(branch_id)) WITH CHECK (public.can_use_pages(ARRAY['/dashboard','/opd','/appointments','/billing','/due-amount','/ortho','/reports','/physiotherapy','/prescription','/patient-medicine','/whatsapp','/insurance-claims','/booking-requests']::text[]) AND public.can_use_branch(branch_id));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.billing') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.billing;
   CREATE POLICY patch_page_access ON public.billing AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/dashboard','/billing','/due-amount','/cash-tally','/daily-cash-book','/analytics','/revenue-dashboard','/medicine-commission']::text[]) AND public.can_use_branch(branch_id)) WITH CHECK (public.can_use_pages(ARRAY['/dashboard','/billing','/due-amount','/cash-tally','/daily-cash-book','/analytics','/revenue-dashboard','/medicine-commission']::text[]) AND public.can_use_branch(branch_id));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.appointments') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.appointments;
   CREATE POLICY patch_page_access ON public.appointments AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/dashboard','/appointments','/booking-requests']::text[]) AND public.can_use_branch(branch_id)) WITH CHECK (public.can_use_pages(ARRAY['/dashboard','/appointments','/booking-requests']::text[]) AND public.can_use_branch(branch_id));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.prescriptions') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.prescriptions;
   CREATE POLICY patch_page_access ON public.prescriptions AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/prescription','/opd']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/prescription','/opd']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.medical_history') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.medical_history;
   CREATE POLICY patch_page_access ON public.medical_history AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/opd']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/opd']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.fracture_cases') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.fracture_cases;
   CREATE POLICY patch_page_access ON public.fracture_cases AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/ortho','/plaster-sync']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/ortho','/plaster-sync']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.fracture_xrays') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.fracture_xrays;
   CREATE POLICY patch_page_access ON public.fracture_xrays AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/ortho','/plaster-sync']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/ortho','/plaster-sync']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.hospitals') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.hospitals;
   CREATE POLICY patch_page_access ON public.hospitals AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/ortho']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/ortho']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.physiotherapy_sessions') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.physiotherapy_sessions;
   CREATE POLICY patch_page_access ON public.physiotherapy_sessions AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/physiotherapy','/ortho']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/physiotherapy','/ortho']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.beds') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.beds;
   CREATE POLICY patch_page_access ON public.beds AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/ipd','/dashboard']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/ipd','/dashboard']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.xray_reports') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.xray_reports;
   CREATE POLICY patch_page_access ON public.xray_reports AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/reports','/ortho']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/reports','/ortho']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.report_payments') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.report_payments;
   CREATE POLICY patch_page_access ON public.report_payments AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/reports','/analytics']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/reports','/analytics']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.cash_book_entries') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.cash_book_entries;
   CREATE POLICY patch_page_access ON public.cash_book_entries AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/daily-cash-book']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/daily-cash-book']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.cash_book_days') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.cash_book_days;
   CREATE POLICY patch_page_access ON public.cash_book_days AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/daily-cash-book']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/daily-cash-book']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.payments') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.payments;
   CREATE POLICY patch_page_access ON public.payments AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/billing','/daily-cash-book','/cash-tally']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/billing','/daily-cash-book','/cash-tally']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.medicines') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.medicines;
   CREATE POLICY patch_page_access ON public.medicines AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/inventory','/medicine-master','/patient-medicine']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/inventory','/medicine-master','/patient-medicine']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.stock_movements') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.stock_movements;
   CREATE POLICY patch_page_access ON public.stock_movements AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/inventory']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/inventory']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.medicine_entries') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.medicine_entries;
   CREATE POLICY patch_page_access ON public.medicine_entries AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/patient-medicine','/medicine-commission']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/patient-medicine','/medicine-commission']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.invoice_medicine_mapping') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.invoice_medicine_mapping;
   CREATE POLICY patch_page_access ON public.invoice_medicine_mapping AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/patient-medicine','/medicine-commission']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/patient-medicine','/medicine-commission']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.patient_medicines') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.patient_medicines;
   CREATE POLICY patch_page_access ON public.patient_medicines AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/patient-medicine','/opd']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/patient-medicine','/opd']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.sms_logs') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.sms_logs;
   CREATE POLICY patch_page_access ON public.sms_logs AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/sms-logs','/whatsapp','/due-amount','/billing','/ortho']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/sms-logs','/whatsapp','/due-amount','/billing','/ortho']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.insurance_claims') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.insurance_claims;
   CREATE POLICY patch_page_access ON public.insurance_claims AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/insurance-claims']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/insurance-claims']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.booking_requests') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.booking_requests;
   CREATE POLICY patch_page_access ON public.booking_requests AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/booking-requests']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/booking-requests']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.branches') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.branches;
   CREATE POLICY patch_page_access ON public.branches AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['*']::text[])) WITH CHECK (public.can_use_pages(ARRAY['*']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.audit_logs') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.audit_logs;
   CREATE POLICY patch_page_access ON public.audit_logs AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY['/audit-log']::text[])) WITH CHECK (public.can_use_pages(ARRAY['/audit-log']::text[]));
 END IF;
END $$;
DO $$ BEGIN
 IF to_regclass('public.deleted_records_log') IS NOT NULL THEN
   DROP POLICY IF EXISTS patch_page_access ON public.deleted_records_log;
   CREATE POLICY patch_page_access ON public.deleted_records_log AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_use_pages(ARRAY[]::text[])) WITH CHECK (public.can_use_pages(ARRAY[]::text[]));
 END IF;
END $$;

DROP POLICY IF EXISTS patch_page_access ON public.audit_logs;
CREATE POLICY patch_page_access ON public.audit_logs AS RESTRICTIVE FOR SELECT TO authenticated USING (public.can_use_pages(ARRAY['/audit-log']));
DROP POLICY IF EXISTS patch_audit_insert ON public.audit_logs;
CREATE POLICY patch_audit_insert ON public.audit_logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_use_pages(ARRAY['*']));

-- Remove old anonymous stock/audit write access. Admin/assigned staff only.
DROP POLICY IF EXISTS stock_movements_select ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_insert ON public.stock_movements;
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated USING (public.can_use_pages(ARRAY['/inventory']));
-- All new adjustments must go through the atomic RPC; no independent movement insertion.
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (public.can_use_pages(ARRAY['/audit-log']));
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.adjust_stock_atomic(p_id uuid, p_medicine uuid, p_qty numeric, p_reason text DEFAULT 'manual', p_note text DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS public.medicines LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE med public.medicines; previous public.stock_movements;
BEGIN
 IF NOT public.can_use_pages(ARRAY['/inventory']) THEN RAISE EXCEPTION 'Inventory permission required'; END IF;
 SELECT * INTO med FROM public.medicines WHERE id=p_medicine FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Medicine not found'; END IF;
 SELECT * INTO previous FROM public.stock_movements WHERE id=p_id;
 IF FOUND THEN
   IF previous.medicine_id IS DISTINCT FROM p_medicine OR previous.change_qty IS DISTINCT FROM p_qty THEN RAISE EXCEPTION 'Conflicting adjustment ID'; END IF;
   RETURN med; -- response lost / retry: no duplicate deduction
 END IF;
 IF p_qty IS NULL OR p_qty=0 OR p_qty::text IN ('NaN','Infinity','-Infinity') OR med.stock_quantity+p_qty<0 THEN RAISE EXCEPTION 'Insufficient stock or invalid quantity'; END IF;
 UPDATE public.medicines SET stock_quantity=stock_quantity+p_qty WHERE id=p_medicine RETURNING * INTO med;
 INSERT INTO public.stock_movements(id,medicine_id,medicine_name,change_qty,reason,note,created_by)
 VALUES(p_id,p_medicine,med.name,p_qty,coalesce(p_reason,'manual'),p_note,coalesce(p_actor,auth.uid()::text));
 RETURN med;
END $$;
REVOKE ALL ON FUNCTION public.adjust_stock_atomic(uuid,uuid,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_atomic(uuid,uuid,numeric,text,text,text) TO authenticated;

-- Receipt history is an append-only ledger on each bill. Each event has a stable ID.
-- Existing lifetime balances have unknown receipt dates: preserve an explicitly legacy opening event.
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
 NEW.status:=CASE WHEN total>=greatest(NEW.amount-coalesce(NEW.discount,0),0) THEN 'Paid' WHEN total>0 THEN 'Partial' ELSE 'Pending' END;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billing_receipt_ledger ON public.billing;
CREATE TRIGGER billing_receipt_ledger BEFORE INSERT OR UPDATE ON public.billing FOR EACH ROW EXECUTE FUNCTION public.merge_bill_receipts();
COMMIT;
