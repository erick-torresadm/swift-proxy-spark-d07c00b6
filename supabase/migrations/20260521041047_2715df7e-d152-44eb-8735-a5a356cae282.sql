
ALTER TABLE public.provider_orders
  ADD COLUMN IF NOT EXISTS triggered_by_order_id uuid;

CREATE INDEX IF NOT EXISTS idx_provider_orders_pending
  ON public.provider_orders (product_id, status, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.purchase_locks (
  product_id uuid PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia purchase_locks"
  ON public.purchase_locks
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
