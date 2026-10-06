-- Apply after 20261006180000_offline_cashbook_followup.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.delete_record_authorized(p_table text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_row jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_table NOT IN ('patients','billing','appointments','prescriptions','medical_history','fracture_cases','fracture_xrays','physiotherapy_sessions','beds','xray_reports','hospitals','insurance_claims','patient_medicines','medicine_entries','invoice_medicine_mapping','medicines','cash_book_entries','cash_book_days','payments','booking_requests','branches','report_payments','sms_logs') THEN RAISE EXCEPTION 'Invalid delete target'; END IF;
 -- Row lock makes concurrent/retried deletes log exactly once.
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table) INTO old_row USING p_id;
 IF old_row IS NULL THEN RETURN true; END IF;
 INSERT INTO public.deleted_records_log(table_name,record_id,record_data,deleted_by)
 VALUES(p_table,p_id,old_row,auth.uid());
 -- Existing foreign keys cascade in this same transaction. A failure rolls back the audit too.
 EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING p_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_record_authorized(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_record_authorized(text,uuid) TO authenticated;
COMMIT;
