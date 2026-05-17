CREATE TABLE IF NOT EXISTS public.report_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL DEFAULT 'Unknown',
  amount numeric NOT NULL DEFAULT 50,
  transaction_id text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_time text,
  upi_id text NOT NULL DEFAULT 'ryashpal18@okicici',
  status text NOT NULL DEFAULT 'paid',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.report_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_payments' AND policyname = 'staff_select_report_payments') THEN
    CREATE POLICY staff_select_report_payments ON public.report_payments FOR SELECT TO authenticated USING (is_staff(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_payments' AND policyname = 'staff_insert_report_payments') THEN
    CREATE POLICY staff_insert_report_payments ON public.report_payments FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_payments' AND policyname = 'staff_update_report_payments') THEN
    CREATE POLICY staff_update_report_payments ON public.report_payments FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_payments' AND policyname = 'admin_delete_report_payments') THEN
    CREATE POLICY admin_delete_report_payments ON public.report_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS patient_name text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS patient_age text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS patient_gender text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS body_part text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS view_projection text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS clinical_history text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS report_data text;
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS clinic_name text DEFAULT 'Balaji Ortho Care Center';
ALTER TABLE public.xray_reports ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE public.xray_reports ALTER COLUMN patient_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_payments_payment_date ON public.report_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_xray_reports_created_at ON public.xray_reports(created_at);