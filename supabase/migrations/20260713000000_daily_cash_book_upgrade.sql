-- ── Daily Cash Book — Day Closing / Physical Verification / Reopen Audit ──
-- ADDITIVE ONLY migration. Does NOT touch public.cash_book_entries,
-- billing, patients, or any other existing table/column. Existing
-- cash_book_entries data and RLS remain completely untouched.
--
-- This new table stores ONE row per calendar day, capturing the
-- "Day Closing" snapshot (physical cash count, calculated closing,
-- difference, remarks) plus the full Reopen-Day audit trail
-- (who reopened, why, when, how many times).

CREATE TABLE IF NOT EXISTS public.cash_book_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL UNIQUE,

  -- Day-closing snapshot (filled when the day is closed)
  physical_cash numeric,
  calculated_closing numeric,
  difference numeric,
  remarks text,

  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by text,
  closed_at timestamptz,

  -- Admin-only Reopen-Day audit trail
  reopened_by text,
  reopened_at timestamptz,
  reopen_reason text,
  reopen_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_book_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_cash_book_days" ON public.cash_book_days
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_cash_book_days" ON public.cash_book_days
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_cash_book_days" ON public.cash_book_days
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_cash_book_days_entry_date ON public.cash_book_days (entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_book_days_status ON public.cash_book_days (status);

-- Note: "Reopen Day" is enforced in the app layer (getCurrentRole() === 'admin'),
-- same pattern already used elsewhere in this codebase (useIsAdmin / appConfig
-- getCurrentRole), since RLS has no clean way to distinguish a plain UPDATE
-- from a role-gated status transition without a Postgres function. This
-- mirrors the existing "admin_delete_cash_book" pattern already in the
-- original migration.
