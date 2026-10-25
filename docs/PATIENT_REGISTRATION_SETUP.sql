-- Run once in Supabase SQL Editor as project owner, after taking a backup.
-- Existing numbers stay unchanged. Missing numbers follow created_at, then id.
-- Billing IDs, demographics, dates and all other tables are unchanged.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.patients IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS registration_number text;

-- SNAPSHOT_GUARD

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.patients WHERE registration_number IS NOT NULL
    AND registration_number !~ '^BAOR[0-9]{4,}$') THEN
    RAISE EXCEPTION 'Unexpected existing registration numbers: review before proceeding';
  END IF;
  IF EXISTS (SELECT registration_number FROM public.patients WHERE registration_number IS NOT NULL
    GROUP BY registration_number HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate existing registration numbers: no changes applied';
  END IF;
END $$;

-- Temporarily suspend only user UPDATE triggers under the exclusive table lock.
-- This prevents timestamp/audit triggers from modifying historic dates or other tables.
CREATE TEMP TABLE registration_saved_triggers ON COMMIT DROP AS
  SELECT tgname, tgenabled FROM pg_trigger
  WHERE tgrelid = 'public.patients'::regclass AND NOT tgisinternal
    AND (tgtype::integer & 16) <> 0 AND tgenabled <> 'D';
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT * FROM registration_saved_triggers LOOP
    EXECUTE format('ALTER TABLE public.patients DISABLE TRIGGER %I', t.tgname);
  END LOOP;
END $$;

-- BACKFILL
WITH last_number AS (
  SELECT coalesce(max(substring(registration_number FROM 5)::bigint), 0) AS n
  FROM public.patients WHERE registration_number IS NOT NULL
), numbered AS (
  SELECT id, (SELECT n FROM last_number) + row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS n
  FROM public.patients WHERE registration_number IS NULL
)
UPDATE public.patients p SET registration_number = 'BAOR' || lpad(n.n::text, greatest(4, length(n.n::text)), '0')
FROM numbered n WHERE p.id = n.id;
-- END_BACKFILL

DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT * FROM registration_saved_triggers LOOP
    EXECUTE format('ALTER TABLE public.patients ENABLE %s TRIGGER %I',
      CASE t.tgenabled WHEN 'A' THEN 'ALWAYS' WHEN 'R' THEN 'REPLICA' ELSE '' END, t.tgname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS patients_registration_number_key ON public.patients(registration_number);
CREATE SEQUENCE IF NOT EXISTS public.patient_registration_seq AS bigint;
SELECT setval('public.patient_registration_seq', greatest(
  coalesce((SELECT max(substring(registration_number FROM 5)::bigint) FROM public.patients), 0),
  (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.patient_registration_seq), 1
), EXISTS (SELECT 1 FROM public.patients) OR (SELECT is_called FROM public.patient_registration_seq));
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.patient_registration_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_patient_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.registration_number IS NOT NULL THEN
    IF NEW.registration_number IS DISTINCT FROM OLD.registration_number THEN
      RAISE EXCEPTION 'Patient registration number is permanent';
    END IF;
    RETURN NEW;
  END IF;
  -- Serialize server allocations and advancement for numbers allocated offline.
  PERFORM pg_advisory_xact_lock(821734, 1);
  IF NEW.registration_number IS NULL THEN
    n := nextval('public.patient_registration_seq'::regclass);
    NEW.registration_number := 'BAOR' || lpad(n::text, greatest(4, length(n::text)), '0');
  ELSIF NEW.registration_number !~ '^BAOR[0-9]{4,}$' THEN
    RAISE EXCEPTION 'Invalid registration number';
  ELSE
    n := substring(NEW.registration_number FROM 5)::bigint;
    IF n < 1 THEN RAISE EXCEPTION 'Invalid registration serial'; END IF;
    PERFORM setval('public.patient_registration_seq'::regclass, greatest(n,
      (SELECT last_value FROM public.patient_registration_seq)), true);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_patient_registration() FROM PUBLIC;
DROP TRIGGER IF EXISTS assign_patient_registration ON public.patients;
CREATE TRIGGER assign_patient_registration BEFORE INSERT OR UPDATE OF registration_number ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.assign_patient_registration();
ALTER TABLE public.patients ALTER COLUMN registration_number SET NOT NULL;
COMMENT ON COLUMN public.patients.registration_number IS 'Permanent patient registration, independent of billing invoice ID';
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT count(*) AS total_patients, count(registration_number) AS registered_patients,
  max(substring(registration_number FROM 5)::bigint) AS last_registration_serial
FROM public.patients;
