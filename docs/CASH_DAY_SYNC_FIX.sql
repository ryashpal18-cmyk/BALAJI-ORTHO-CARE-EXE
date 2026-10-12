-- Run in the Lovable SQL editor for the working idcxmeczzfnipmybikue database.
-- Adds the confirmed missing cash-day table; does not delete existing records.
BEGIN;
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
COMMIT;
NOTIFY pgrst, 'reload schema';
SELECT to_regclass('public.cash_book_days') IS NOT NULL AS cash_book_days_available;
