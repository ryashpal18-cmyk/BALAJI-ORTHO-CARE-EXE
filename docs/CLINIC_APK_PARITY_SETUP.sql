-- Additive compatibility repair: a package plan is metadata, not completed session 1.
-- No historical records or receipt totals are modified.
CREATE OR REPLACE FUNCTION public.clinic_physio_identity(p_case uuid,p_plan text,p_notes text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE n jsonb; bill text; BEGIN
 BEGIN n=coalesce(p_notes,'{}')::jsonb; EXCEPTION WHEN invalid_text_representation THEN n='{}'::jsonb; END;
 bill=regexp_replace(coalesce(n->>'billId',''),'^local_','');
 IF n->>'clinicTool'='1' AND n->>'kind' IN ('physio-package-plan','physio-package-session') AND bill ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RETURN CASE WHEN n->>'kind'='physio-package-plan' THEN 'marker:' ELSE '' END || 'package:'||lower(bill);
 END IF;
 RETURN coalesce('case:'||p_case::text,'plan:'||coalesce(p_plan,''));
END $$;
REVOKE ALL ON FUNCTION public.clinic_physio_identity(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clinic_physio_identity(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.clinic_physio_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE course text; BEGIN
 course=public.clinic_physio_identity(NEW.fracture_case_id,NEW.exercise_plan,NEW.progress_notes);
 PERFORM pg_advisory_xact_lock(hashtextextended('physio:'||NEW.patient_id::text||':'||regexp_replace(course,'^marker:',''),0));
 IF NEW.session_number IS NULL OR NEW.total_sessions IS NULL OR NEW.pain_scale IS NULL OR NEW.session_number<1 OR NEW.total_sessions<NEW.session_number OR NEW.pain_scale<0 OR NEW.pain_scale>10 THEN RAISE EXCEPTION 'Invalid physio session values'; END IF;
 IF (course LIKE 'package:%' OR course LIKE 'marker:package:%') AND NOT EXISTS(SELECT 1 FROM public.billing b WHERE b.id=split_part(course,'package:',2)::uuid AND b.patient_id=NEW.patient_id) THEN RAISE EXCEPTION 'Physio package bill missing or patient mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.physiotherapy_sessions r WHERE r.id<>NEW.id AND r.patient_id=NEW.patient_id AND (course LIKE 'marker:%' OR r.session_number=NEW.session_number) AND public.clinic_physio_identity(r.fracture_case_id,r.exercise_plan,r.progress_notes)=course) THEN RAISE EXCEPTION 'Physio session already exists for this course'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clinic_physio_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clinic_physio_guard() TO authenticated;
