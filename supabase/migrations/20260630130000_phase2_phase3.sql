-- ── Phase 2+3 additions: Insurance Claims, Multi-Branch, Patient Self-Booking ──

-- 1) Insurance / TPA Claims
CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  billing_id uuid REFERENCES public.billing(id) ON DELETE SET NULL,
  tpa_name text NOT NULL,              -- e.g. "Star Health", "Niva Bupa", "CGHS"
  policy_number text,
  claim_amount numeric NOT NULL DEFAULT 0,
  approved_amount numeric,
  status text NOT NULL DEFAULT 'Submitted', -- Submitted | Under Review | Approved | Partially Approved | Rejected | Settled
  submitted_date date NOT NULL DEFAULT CURRENT_DATE,
  settled_date date,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_select_claims" ON public.insurance_claims FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_claims" ON public.insurance_claims FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_claims" ON public.insurance_claims FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin_delete_claims" ON public.insurance_claims FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON public.insurance_claims (status);

-- 2) Multi-branch support
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_select_branches" ON public.branches FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin_write_branches" ON public.branches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Default branch so existing data has somewhere to belong
INSERT INTO public.branches (name, is_active)
  SELECT 'Khinwara (Main)', true
  WHERE NOT EXISTS (SELECT 1 FROM public.branches);

-- Add branch_id to key tables (nullable — existing rows stay NULL = main branch)
ALTER TABLE public.patients     ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.billing      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- 3) Patient self-service booking requests (public, no login needed)
CREATE TABLE IF NOT EXISTS public.booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL,
  mobile text NOT NULL,
  preferred_date date NOT NULL,
  preferred_time text,
  reason text,
  status text NOT NULL DEFAULT 'Pending', -- Pending | Confirmed | Rejected
  branch_id uuid REFERENCES public.branches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (even unauthenticated patients) can submit a booking request
CREATE POLICY "public_insert_booking" ON public.booking_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only staff can view/manage the requests
CREATE POLICY "staff_select_booking" ON public.booking_requests
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_booking" ON public.booking_requests
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_booking" ON public.booking_requests
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON public.booking_requests (status);
