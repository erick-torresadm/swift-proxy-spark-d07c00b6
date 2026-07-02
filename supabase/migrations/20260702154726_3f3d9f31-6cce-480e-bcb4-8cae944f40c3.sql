ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bumps jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vip_support boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_offered_at timestamptz,
  ADD COLUMN IF NOT EXISTS upsell_taken boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_order_id uuid REFERENCES public.orders(id);

CREATE INDEX IF NOT EXISTS orders_upsell_taken_idx ON public.orders(upsell_taken) WHERE upsell_taken = true;
CREATE INDEX IF NOT EXISTS orders_vip_support_idx ON public.orders(vip_support) WHERE vip_support = true;