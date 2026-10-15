-- DR REG: doctors table + billing par doctor fields.
-- Apply after 20261006200000_atomic_delete_audit.sql (Supabase -> SQL Editor -> Run, ek baar).
-- Dobara chalane par bhi safe hai (IF NOT EXISTS / DROP POLICY IF EXISTS).
BEGIN;

CREATE TABLE IF NOT EXISTS public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text,
  speciality text,
  commission_percent numeric NOT NULL DEFAULT 20 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Billing page wale staff doctor list padh sakte hain; add/edit sirf DR REG page wale (ya admin).
DROP POLICY IF EXISTS doctors_select ON public.doctors;
CREATE POLICY doctors_select ON public.doctors FOR SELECT TO authenticated
  USING (public.can_use_pages(ARRAY['/billing','/dr-reg']::text[]));
DROP POLICY IF EXISTS doctors_insert ON public.doctors;
CREATE POLICY doctors_insert ON public.doctors FOR INSERT TO authenticated
  WITH CHECK (public.can_use_pages(ARRAY['/dr-reg']::text[]));
DROP POLICY IF EXISTS doctors_update ON public.doctors;
CREATE POLICY doctors_update ON public.doctors FOR UPDATE TO authenticated
  USING (public.can_use_pages(ARRAY['/dr-reg']::text[]))
  WITH CHECK (public.can_use_pages(ARRAY['/dr-reg']::text[]));
DROP POLICY IF EXISTS doctors_admin_delete ON public.doctors;
CREATE POLICY doctors_admin_delete ON public.doctors FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_doctors_updated_at ON public.doctors;
CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bill par doctor. NULL = default doctor (Dr. S. S. Rathore), purane saare bills waise hi rehte hain.
-- Commission yahan save nahi hota: report mein X-ray services x doctor_commission_percent se nikalta hai.
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS doctor_name text;
ALTER TABLE public.billing ADD COLUMN IF NOT EXISTS doctor_commission_percent numeric;
CREATE INDEX IF NOT EXISTS idx_billing_doctor_id ON public.billing (doctor_id) WHERE doctor_id IS NOT NULL;

COMMIT;

-- API ko naye columns turant dikhane ke liye.
NOTIFY pgrst, 'reload schema';
