-- ── Fix: Recovery Tracker data isolation ──
-- physiotherapy_sessions table ab tak sirf patient_id se linked thi,
-- isliye agar ek patient ke 2 alag fracture cases hon (ya general
-- Physiotherapy module ke sessions ho), to Recovery Tracker page
-- (per fracture-case) un sabko mix karke dikhata tha — galat chart/history.
--
-- Ab fracture_case_id add kar rahe hain (nullable — purane/general
-- physiotherapy sessions NULL hi rahenge, sirf naye fracture-specific
-- recovery logs isse linked honge).

ALTER TABLE public.physiotherapy_sessions
  ADD COLUMN IF NOT EXISTS fracture_case_id uuid REFERENCES public.fracture_cases(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_physio_sessions_case ON public.physiotherapy_sessions (fracture_case_id);
