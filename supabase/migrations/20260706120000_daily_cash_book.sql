-- ── Daily Cash Book ──
-- Har din ka cash hisaab: kitna cash/UPI aaya, bank mein kitna dalwaya,
-- ghar pe kitna diya, aur kharcha kitna hua — sab ek jagah, taaki
-- center par abhi kitni cash honi chahiye turant pata chal jaaye.

CREATE TABLE IF NOT EXISTS public.cash_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL CHECK (entry_type IN (
    'opening',       -- din ki shuruaat mein center par jitni cash thi
    'cash_in',       -- aaj cash mein aaya amount
    'upi_in',        -- aaj UPI mein aaya amount
    'bank_deposit',  -- bank mein jama karwaya
    'home_given',    -- ghar pe bheja gaya paisa
    'expense'        -- center ka kharcha
  )),
  amount numeric NOT NULL DEFAULT 0,
  party_name text,      -- account holder / kisko diya / kisko kharche ka paisa diya
  bank_name text,       -- bank deposit ke liye — konsa account/bank
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_book_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_cash_book" ON public.cash_book_entries
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_cash_book" ON public.cash_book_entries
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_cash_book" ON public.cash_book_entries
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin_delete_cash_book" ON public.cash_book_entries
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cash_book_entry_date ON public.cash_book_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_book_entry_type ON public.cash_book_entries (entry_type);
