-- Add foreign key relationship from fracture_cases.patient_id to patients.id
-- so PostgREST can join patient details (name, mobile) into ortho queries.
ALTER TABLE public.fracture_cases
  ADD CONSTRAINT fracture_cases_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

-- Same for fracture_xrays so x-ray queries can join patient info too.
ALTER TABLE public.fracture_xrays
  ADD CONSTRAINT fracture_xrays_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;

ALTER TABLE public.fracture_xrays
  ADD CONSTRAINT fracture_xrays_case_id_fkey
  FOREIGN KEY (fracture_case_id) REFERENCES public.fracture_cases(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fracture_cases_patient_id ON public.fracture_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_fracture_xrays_patient_id ON public.fracture_xrays(patient_id);
CREATE INDEX IF NOT EXISTS idx_fracture_xrays_case_id ON public.fracture_xrays(fracture_case_id);