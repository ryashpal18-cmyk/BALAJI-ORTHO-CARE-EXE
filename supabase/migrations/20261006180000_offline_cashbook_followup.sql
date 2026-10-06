-- Apply after the F01-F16 migration, before installing this EXE.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_cash_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(6100618);
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM cash_book_days WHERE entry_date=OLD.entry_date AND status='closed') THEN
  RAISE EXCEPTION 'Reopen the cash day before changing entries' USING ERRCODE='23514';
 END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM cash_book_days WHERE entry_date=NEW.entry_date AND status='closed') THEN
  RAISE EXCEPTION 'Reopen the cash day before changing entries' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_cash_entry ON public.cash_book_entries;
CREATE TRIGGER guard_cash_entry BEFORE INSERT OR UPDATE OR DELETE ON public.cash_book_entries FOR EACH ROW EXECUTE FUNCTION public.guard_cash_entry();
-- Closing is uniquely identified by date, not the independent UUID generated on each PC.
-- Conflicting financial values still go through guard_cashbook_day; never silently overwrite a closed snapshot.
CREATE OR REPLACE FUNCTION public.save_cash_day(p_id uuid,p_event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE saved public.cash_book_days;
BEGIN
 IF NOT public.can_use_clinic_cashbook() THEN RAISE EXCEPTION 'Cash book permission required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.cash_book_days(id,entry_date,status,physical_cash,calculated_closing,difference,remarks,reopen_reason)
 VALUES(p_id,(p_event->>'entry_date')::date,coalesce(p_event->>'status','open'),(p_event->>'physical_cash')::numeric,
 (p_event->>'calculated_closing')::numeric,(p_event->>'difference')::numeric,p_event->>'remarks',p_event->>'reopen_reason')
 ON CONFLICT(entry_date) DO UPDATE SET status=EXCLUDED.status,
 physical_cash=coalesce(EXCLUDED.physical_cash,cash_book_days.physical_cash),
 calculated_closing=coalesce(EXCLUDED.calculated_closing,cash_book_days.calculated_closing),
 difference=coalesce(EXCLUDED.difference,cash_book_days.difference),
 remarks=coalesce(EXCLUDED.remarks,cash_book_days.remarks),reopen_reason=EXCLUDED.reopen_reason
 RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_cash_day(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_cash_day(uuid,jsonb) TO authenticated;

-- Matching event identities are idempotent; conflicting corrections are retained for review.
CREATE OR REPLACE FUNCTION public.merge_bill_receipts() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE history jsonb; event jsonb; delta numeric; old_paid numeric; total numeric;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.payment_history IS NULL THEN
     NEW.payment_history := CASE WHEN NEW.amount_paid=0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
       'id',gen_random_uuid(),'amount',NEW.amount_paid,'paid_at',coalesce(NEW.created_at,now()),'payment_mode',coalesce(NEW.payment_mode,'Cash'))) END;
   END IF;
 ELSE
   old_paid := OLD.amount_paid;
   history := coalesce(OLD.payment_history, CASE WHEN old_paid=0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
     'id','legacy-'||OLD.id,'amount',old_paid,'paid_at',OLD.created_at,'payment_mode',coalesce(OLD.payment_mode,'Cash'),'legacy',true)) END);
   IF NEW.payment_history IS NOT DISTINCT FROM OLD.payment_history THEN
     delta := NEW.amount_paid-old_paid;
     IF delta<>0 THEN history:=history||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'amount',delta,'paid_at',now(),'payment_mode',coalesce(NEW.payment_mode,'Cash'))); END IF;
   ELSE
     IF jsonb_typeof(NEW.payment_history)<>'array' THEN RAISE EXCEPTION 'Invalid receipt ledger'; END IF;
     FOR event IN SELECT value FROM jsonb_array_elements(NEW.payment_history) LOOP
       IF EXISTS (SELECT 1 FROM jsonb_array_elements(history) e WHERE e->>'id'=event->>'id'
         AND ((e->>'amount')::numeric IS DISTINCT FROM (event->>'amount')::numeric
           OR e->>'payment_mode' IS DISTINCT FROM event->>'payment_mode'
           OR (e->>'paid_at')::timestamptz IS DISTINCT FROM (event->>'paid_at')::timestamptz)) THEN
         RAISE EXCEPTION 'Receipt correction conflict: refresh and review payment mode' USING ERRCODE='23514';
       END IF;
       IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(history) e WHERE e->>'id'=event->>'id') THEN
         history:=history||jsonb_build_array(event);
       END IF;
     END LOOP;
   END IF;
   NEW.payment_history:=history;
 END IF;
 IF jsonb_typeof(NEW.payment_history)<>'array' THEN RAISE EXCEPTION 'Invalid receipt ledger'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payment_history) e WHERE e->>'id' IS NULL OR e->>'amount' IS NULL OR e->>'paid_at' IS NULL) THEN RAISE EXCEPTION 'Incomplete receipt'; END IF;
 SELECT coalesce(sum((e->>'amount')::numeric),0) INTO total FROM jsonb_array_elements(NEW.payment_history) e;
 IF total<0 OR total::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid paid balance'; END IF;
 NEW.amount_paid:=total;
 NEW.status:=CASE WHEN total>=greatest(NEW.amount-coalesce(NEW.discount,0),0) THEN 'Paid' WHEN total>0 THEN 'Partial' ELSE 'Pending' END;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_cashbook_day() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(6100618);
 IF TG_OP='UPDATE' AND OLD.status='closed' AND NEW.status='closed' AND
  (NEW.physical_cash,NEW.calculated_closing,NEW.difference,NEW.remarks) IS NOT DISTINCT FROM (OLD.physical_cash,OLD.calculated_closing,OLD.difference,OLD.remarks) THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator must reopen closed day'; END IF;
  IF NEW.status='open' THEN
   IF nullif(trim(NEW.reopen_reason),'') IS NULL THEN RAISE EXCEPTION 'Reopen reason required'; END IF;
   NEW.reopened_by:=auth.uid()::text; NEW.reopened_at:=now(); NEW.reopen_count:=OLD.reopen_count+1;
  ELSE RAISE EXCEPTION 'Reopen the day before changing it'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='open' AND NOT public.has_role(auth.uid(),'admin') AND
  (NEW.reopened_by,NEW.reopened_at,NEW.reopen_reason,NEW.reopen_count) IS DISTINCT FROM (OLD.reopened_by,OLD.reopened_at,OLD.reopen_reason,OLD.reopen_count)
 THEN RAISE EXCEPTION 'Reopen audit fields are protected'; END IF;
 IF NEW.status='closed' AND (TG_OP='INSERT' OR OLD.status<>'closed') THEN NEW.closed_by:=auth.uid()::text; NEW.closed_at:=now(); END IF;
 RETURN NEW;
END $$;

COMMIT;
