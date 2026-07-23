-- 1) products: qual provedor entrega este SKU
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'proxyseller';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_provider_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_provider_check
  CHECK (provider IN ('proxyseller','fastproxy_vps'));

-- 2) provider_orders: qual provedor originou o bloco
ALTER TABLE public.provider_orders
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'proxyseller';

ALTER TABLE public.provider_orders
  DROP CONSTRAINT IF EXISTS provider_orders_provider_check;
ALTER TABLE public.provider_orders
  ADD CONSTRAINT provider_orders_provider_check
  CHECK (provider IN ('proxyseller','fastproxy_vps'));

-- 3) linha de config para o novo provedor (feature flag inicial)
INSERT INTO public.provider_settings (provider, dry_run)
VALUES ('fastproxy_vps', true)
ON CONFLICT (provider) DO NOTHING;