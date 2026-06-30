-- ── Phase 1 additions: Inventory (stock) + Audit Trail ──

-- 1) Stock columns on medicines table
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';

-- 2) Stock movement log (every add/reduce recorded — useful for audits)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid REFERENCES public.medicines(id) ON DELETE SET NULL,
  medicine_name text NOT NULL,
  change_qty numeric NOT NULL,           -- positive = stock in, negative = stock out
  reason text NOT NULL DEFAULT 'manual', -- manual | sale | purchase | adjustment
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT USING (true);
CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT WITH CHECK (true);

-- 3) Audit trail — generic activity log for any module
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_name text NOT NULL,
  actor_role text,
  action text NOT NULL,        -- e.g. 'create' | 'update' | 'delete' | 'login' | 'print'
  module text NOT NULL,        -- e.g. 'billing' | 'ortho' | 'medicine-master'
  record_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (true);
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_medicine ON public.stock_movements (medicine_id);
