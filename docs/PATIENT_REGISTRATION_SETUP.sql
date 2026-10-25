-- Run once in Supabase SQL Editor as project owner, after taking a backup.
-- Existing numbers stay unchanged. Missing numbers follow created_at, then id.
-- Billing IDs, demographics, dates and all other tables are unchanged.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.patients IN ACCESS EXCLUSIVE MODE;
-- Use the same lock as live EXE/APK number reservations; never reseed over a running reservation.
SELECT pg_advisory_xact_lock(821734, 1);
CREATE TEMP TABLE registration_patient_snapshot ON COMMIT DROP AS
  SELECT id, to_jsonb(p) - 'registration_number' AS original_fields,
         to_jsonb(p) ->> 'registration_number' AS original_registration
  FROM public.patients p;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS registration_number text;

-- SNAPSHOT_GUARD

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.patients WHERE registration_number IS NOT NULL
    AND (registration_number !~ '^BAOR[0-9]{4,}$' OR registration_number ~ '^BAOR0{4,}$')) THEN
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
CREATE SEQUENCE IF NOT EXISTS public.patient_registration_seq AS bigint;
WITH last_number AS (
  SELECT greatest(coalesce(max(substring(registration_number FROM 5)::bigint), 0),
    (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.patient_registration_seq)) AS n
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
-- Shared unique offline pools for EXE and APK. Existing patient numbers are unchanged.
CREATE TABLE IF NOT EXISTS public.patient_registration_leases (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  device_id uuid NOT NULL,
  numbers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_registration_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_registration_leases FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.patient_registration_leases TO authenticated;
DROP POLICY IF EXISTS registration_lease_owner_read ON public.patient_registration_leases;
CREATE POLICY registration_lease_owner_read ON public.patient_registration_leases FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS registration_lease_owner_insert ON public.patient_registration_leases;
CREATE POLICY registration_lease_owner_insert ON public.patient_registration_leases FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.has_role((SELECT auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.reserve_patient_registration_numbers(p_request uuid, p_device uuid, p_count integer DEFAULT 32, p_floor bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE reserved jsonb; existing_device uuid; i integer; n bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Clinic administrator required'; END IF;
  IF p_request IS NULL OR p_device IS NULL OR p_count NOT BETWEEN 1 AND 100 OR p_floor NOT BETWEEN 0 AND 9007199254740000 THEN
    RAISE EXCEPTION 'Invalid registration reservation';
  END IF;
  PERFORM pg_advisory_xact_lock(821734, 1);
  SELECT numbers, device_id INTO reserved, existing_device FROM public.patient_registration_leases
    WHERE request_id = p_request AND user_id = auth.uid();
  IF reserved IS NOT NULL THEN
    IF existing_device <> p_device THEN RAISE EXCEPTION 'Reservation belongs to another device'; END IF;
    RETURN jsonb_build_object('request_id', p_request, 'numbers', reserved);
  END IF;
  IF p_floor > (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.patient_registration_seq) THEN
    PERFORM setval('public.patient_registration_seq', p_floor, true);
  END IF;
  reserved := '[]'::jsonb;
  FOR i IN 1..p_count LOOP
    n := nextval('public.patient_registration_seq');
    reserved := reserved || jsonb_build_array('BAOR' || lpad(n::text, greatest(4, length(n::text)), '0'));
  END LOOP;
  INSERT INTO public.patient_registration_leases(request_id, user_id, device_id, numbers)
    VALUES (p_request, auth.uid(), p_device, reserved);
  RETURN jsonb_build_object('request_id', p_request, 'numbers', reserved);
END $$;
REVOKE ALL ON FUNCTION public.reserve_patient_registration_numbers(uuid,uuid,integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_patient_registration_numbers(uuid,uuid,integer,bigint) TO authenticated;

-- Refuse to commit if any old patient field or assigned number changed unexpectedly.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.patients) <> (SELECT count(*) FROM registration_patient_snapshot)
     OR EXISTS (
       SELECT 1 FROM registration_patient_snapshot snapshot
       LEFT JOIN public.patients p ON p.id = snapshot.id
       WHERE p.id IS NULL
          OR (to_jsonb(p) - 'registration_number') IS DISTINCT FROM snapshot.original_fields
          OR (snapshot.original_registration IS NOT NULL AND p.registration_number IS DISTINCT FROM snapshot.original_registration)
     ) THEN
    RAISE EXCEPTION 'Patient safety check failed: original fields or registration changed. No table changes committed';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT count(*) AS total_patients, count(registration_number) AS registered_patients,
  max(substring(registration_number FROM 5)::bigint) AS last_registration_serial
FROM public.patients;
