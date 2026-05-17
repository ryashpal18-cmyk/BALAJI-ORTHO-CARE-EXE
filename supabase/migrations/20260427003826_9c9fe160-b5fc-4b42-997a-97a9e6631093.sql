DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_payments' AND policyname = 'public_insert_report_payments') THEN
    CREATE POLICY public_insert_report_payments ON public.report_payments FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'xray_reports' AND policyname = 'public_insert_ai_xray_reports') THEN
    CREATE POLICY public_insert_ai_xray_reports ON public.xray_reports FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;