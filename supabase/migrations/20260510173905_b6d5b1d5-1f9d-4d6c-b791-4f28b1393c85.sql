CREATE TABLE public.fracture_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  patient_type TEXT NOT NULL DEFAULT 'fracture',
  body_part TEXT,
  side TEXT,
  fracture_type TEXT,
  cause TEXT,
  plaster_type TEXT,
  plaster_date DATE DEFAULT CURRENT_DATE,
  followup_days INTEGER NOT NULL DEFAULT 7,
  next_followup_date DATE,
  plaster_status TEXT NOT NULL DEFAULT 'Active',
  hospital_name TEXT,
  doctor_name TEXT,
  referral_reason TEXT,
  doctor_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fracture_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_select_fc ON public.fracture_cases FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY staff_insert_fc ON public.fracture_cases FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY staff_update_fc ON public.fracture_cases FOR UPDATE TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY admin_delete_fc ON public.fracture_cases FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_fc_updated BEFORE UPDATE ON public.fracture_cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_fc_patient ON public.fracture_cases(patient_id);
CREATE INDEX idx_fc_followup ON public.fracture_cases(next_followup_date);

CREATE TABLE public.fracture_xrays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fracture_case_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  image_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fracture_xrays ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_select_fx ON public.fracture_xrays FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY staff_insert_fx ON public.fracture_xrays FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY staff_update_fx ON public.fracture_xrays FOR UPDATE TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY admin_delete_fx ON public.fracture_xrays FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_fx_case ON public.fracture_xrays(fracture_case_id);

CREATE TABLE public.hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  doctor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_select_hosp ON public.hospitals FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY staff_insert_hosp ON public.hospitals FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY staff_update_hosp ON public.hospitals FOR UPDATE TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY admin_delete_hosp ON public.hospitals FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));