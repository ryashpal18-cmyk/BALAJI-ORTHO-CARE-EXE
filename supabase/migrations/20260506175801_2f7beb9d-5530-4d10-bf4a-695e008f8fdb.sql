
CREATE TABLE public.medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.medicine_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL,
  patient_name text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_medicine_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.medicine_entries(id) ON DELETE CASCADE,
  medicine_id uuid REFERENCES public.medicines(id),
  medicine_name text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_medicine_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_select_medicines ON public.medicines FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY staff_insert_medicines ON public.medicines FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY admin_update_medicines ON public.medicines FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY admin_delete_medicines ON public.medicines FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY staff_select_med_entries ON public.medicine_entries FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY staff_insert_med_entries ON public.medicine_entries FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY admin_delete_med_entries ON public.medicine_entries FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY staff_select_med_map ON public.invoice_medicine_mapping FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY staff_insert_med_map ON public.invoice_medicine_mapping FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY admin_delete_med_map ON public.invoice_medicine_mapping FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.medicines (name, rate) VALUES
  ('Tab Aconex SP', 68.72),
  ('Tab Calcikem K27', 135.73),
  ('Tab Cefnex 200 LB', 150.20),
  ('SYP Unisure D3 Nano', 48.54),
  ('Tab Cytocal + D3', 126.89),
  ('Cap Raquil DSR', 118.94);
