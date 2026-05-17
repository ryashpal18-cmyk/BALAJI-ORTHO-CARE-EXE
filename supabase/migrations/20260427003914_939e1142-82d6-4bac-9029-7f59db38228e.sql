DROP POLICY IF EXISTS public_insert_report_payments ON public.report_payments;
DROP POLICY IF EXISTS public_insert_ai_xray_reports ON public.xray_reports;

CREATE POLICY public_insert_report_payments
ON public.report_payments
FOR INSERT
TO anon
WITH CHECK (
  patient_name IS NOT NULL
  AND amount = 50
  AND upi_id = 'ryashpal18@okicici'
  AND status = 'paid'
);

CREATE POLICY public_insert_ai_xray_reports
ON public.xray_reports
FOR INSERT
TO anon
WITH CHECK (
  report_data IS NOT NULL
  AND clinic_name = 'Balaji Ortho Care Center'
);