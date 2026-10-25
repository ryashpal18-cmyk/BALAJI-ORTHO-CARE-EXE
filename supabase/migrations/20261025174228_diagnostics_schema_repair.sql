-- Balaji clinic: additive cloud-schema repair. Run in the clinic project SQL Editor.
-- No patient, bill, payment, registration or saved-date UPDATE/DELETE is performed.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
BEGIN
 IF to_regclass('public.patients') IS NULL OR to_regclass('public.billing') IS NULL OR to_regclass('public.audit_logs') IS NULL THEN
  RAISE EXCEPTION 'Wrong/incomplete clinic database: patients, billing and audit_logs are required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_role') THEN
  RAISE EXCEPTION 'Existing clinic has_role authorization function is required';
 END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name=ANY(ARRAY['id','actor_name','actor_role','action','module','record_id','description']))<>7 THEN
  RAISE EXCEPTION 'Unsupported audit columns; no changes applied';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='id' AND udt_name<>'uuid') THEN
  RAISE EXCEPTION 'Unsupported audit id type; no changes applied';
 END IF;
END $preflight$;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id uuid;
DO $install_audit$
BEGIN
 IF to_regprocedure('public.append_audit_event(uuid,jsonb)') IS NULL THEN
  EXECUTE $ddl$
  CREATE FUNCTION public.append_audit_event(p_id uuid,p_event jsonb) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
  DECLARE owner_id uuid;
  BEGIN
   IF auth.uid() IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin'),false) THEN
    RAISE EXCEPTION 'Cloud administrator required' USING ERRCODE='42501';
   END IF;
   IF p_id IS NULL OR nullif(p_event->>'action','') IS NULL OR nullif(p_event->>'module','') IS NULL THEN
    RAISE EXCEPTION 'Invalid audit event';
   END IF;
   INSERT INTO public.audit_logs(id,actor_user_id,actor_name,actor_role,action,module,record_id,description)
   VALUES(p_id,auth.uid(),auth.uid()::text,'admin',p_event->>'action',p_event->>'module',p_event->>'record_id',p_event->>'description')
   ON CONFLICT(id) DO NOTHING;
   SELECT actor_user_id INTO owner_id FROM public.audit_logs WHERE id=p_id;
   IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Audit identity conflict'; END IF;
   RETURN true;
  END $fn$;
  $ddl$;
  REVOKE ALL ON FUNCTION public.append_audit_event(uuid,jsonb) FROM PUBLIC,anon;
  GRANT EXECUTE ON FUNCTION public.append_audit_event(uuid,jsonb) TO authenticated;
 END IF;
END $install_audit$;
-- Create missing compatibility tables only; leave existing tables and their policies untouched.
DO $optional$
BEGIN
 IF to_regclass('public.report_payments') IS NULL THEN
  CREATE TABLE public.report_payments(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_name text NOT NULL DEFAULT 'Unknown',
   amount numeric NOT NULL DEFAULT 50,transaction_id text,payment_date date NOT NULL DEFAULT CURRENT_DATE,
   payment_time text,upi_id text,status text NOT NULL DEFAULT 'paid',created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.report_payments ENABLE ROW LEVEL SECURITY;
  CREATE POLICY diagnostics_admin ON public.report_payments FOR ALL TO authenticated
   USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.report_payments TO authenticated;
 END IF;
 IF to_regclass('public.patient_medicines') IS NULL THEN
  CREATE TABLE public.patient_medicines(
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),patient_id uuid NOT NULL REFERENCES public.patients(id),
   medicine_id uuid,medicine_name text,dosage text,duration text,created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.patient_medicines ENABLE ROW LEVEL SECURITY;
  CREATE POLICY diagnostics_admin ON public.patient_medicines FOR ALL TO authenticated
   USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.patient_medicines TO authenticated;
 END IF;
END $optional$;
CREATE TABLE IF NOT EXISTS public.cash_book_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL UNIQUE,
  physical_cash numeric, calculated_closing numeric, difference numeric, remarks text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by text, closed_at timestamptz,
  reopened_by text, reopened_at timestamptz, reopen_reason text,
  reopen_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_book_days ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_book_days' AND policyname='sync_repair_cash_admin') THEN
    CREATE POLICY sync_repair_cash_admin ON public.cash_book_days
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.cash_book_days TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_repair_guard_cash_day() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Cloud administrator required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(6100618);
  IF TG_OP='UPDATE' AND OLD.status='closed' THEN
    IF NEW.status='closed' AND
       (NEW.physical_cash,NEW.calculated_closing,NEW.difference,NEW.remarks)
       IS NOT DISTINCT FROM (OLD.physical_cash,OLD.calculated_closing,OLD.difference,OLD.remarks) THEN RETURN OLD; END IF;
    IF NEW.status<>'open' OR nullif(trim(NEW.reopen_reason),'') IS NULL THEN
      RAISE EXCEPTION 'Reopen the closed day with a reason before changing it';
    END IF;
    NEW.reopened_by:=auth.uid()::text; NEW.reopened_at:=now(); NEW.reopen_count:=OLD.reopen_count+1;
  END IF;
  IF TG_OP='INSERT' AND NEW.status='closed' THEN
    NEW.closed_by:=auth.uid()::text; NEW.closed_at:=now();
  ELSIF TG_OP='UPDATE' AND OLD.status<>'closed' AND NEW.status='closed' THEN
    NEW.closed_by:=auth.uid()::text; NEW.closed_at:=now();
  END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cash_book_days'::regclass AND tgname='sync_repair_guard_cash_day') THEN
    CREATE TRIGGER sync_repair_guard_cash_day BEFORE INSERT OR UPDATE ON public.cash_book_days
      FOR EACH ROW EXECUTE FUNCTION public.sync_repair_guard_cash_day();
  END IF;
END $$;

-- Install only if the normal cash-day RPC was never deployed.
DO $install$ BEGIN
 IF to_regprocedure('public.save_cash_day(uuid,jsonb)') IS NULL THEN
  EXECUTE $ddl$
  CREATE FUNCTION public.save_cash_day(p_id uuid,p_event jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
  DECLARE saved public.cash_book_days;
  BEGIN
    IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Cloud administrator required' USING ERRCODE='42501'; END IF;
    INSERT INTO public.cash_book_days(id,entry_date,status,physical_cash,calculated_closing,difference,remarks,reopen_reason)
    VALUES(p_id,(p_event->>'entry_date')::date,coalesce(p_event->>'status','open'),(p_event->>'physical_cash')::numeric,
      (p_event->>'calculated_closing')::numeric,(p_event->>'difference')::numeric,p_event->>'remarks',p_event->>'reopen_reason')
    ON CONFLICT(entry_date) DO UPDATE SET status=EXCLUDED.status,
      physical_cash=coalesce(EXCLUDED.physical_cash,cash_book_days.physical_cash),
      calculated_closing=coalesce(EXCLUDED.calculated_closing,cash_book_days.calculated_closing),
      difference=coalesce(EXCLUDED.difference,cash_book_days.difference),
      remarks=coalesce(EXCLUDED.remarks,cash_book_days.remarks),reopen_reason=EXCLUDED.reopen_reason
    RETURNING * INTO saved;
    RETURN to_jsonb(saved);
  END $fn$;
  $ddl$;
  REVOKE ALL ON FUNCTION public.save_cash_day(uuid,jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.save_cash_day(uuid,jsonb) TO authenticated;
 END IF;
END $install$;

NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT to_regprocedure('public.append_audit_event(uuid,jsonb)') IS NOT NULL AS audit_rpc_ready, to_regprocedure('public.save_cash_day(uuid,jsonb)') IS NOT NULL AS cash_day_rpc_ready, to_regclass('public.report_payments') IS NOT NULL AS report_payments_ready, to_regclass('public.patient_medicines') IS NOT NULL AS patient_medicines_ready;
