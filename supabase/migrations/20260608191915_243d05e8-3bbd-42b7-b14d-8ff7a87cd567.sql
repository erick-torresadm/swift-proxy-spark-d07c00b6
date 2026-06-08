
-- 1) Add restock threshold (proactive replenishment)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS restock_threshold integer NOT NULL DEFAULT 2;

-- 2) Fill missing provider_tariff_id (ProxySeller configs)

-- IPv4 EUA (countryId=565)
UPDATE public.products
SET provider_tariff_id = '{"countryId":565,"periodId":"1m","customTargetName":"General use","protocol":"HTTP"}'
WHERE slug = 'ipv4-us';

-- ISP EUA (countryId=3758)
UPDATE public.products
SET provider_tariff_id = '{"countryId":3758,"periodId":"1m","customTargetName":"General use","protocol":"HTTP"}'
WHERE slug = 'isp-us';

-- IPv6 Facebook Ads EUA (mesmo countryId do IPv6 EUA = 785)
UPDATE public.products
SET provider_tariff_id = '{"countryId":785,"periodId":"1m","protocol":"HTTPS","targetSectionId":8,"targetId":1768}'
WHERE slug = 'ipv6-fb-us';

-- 3) Insert missing BR products (mesmos preços dos equivalentes US)
INSERT INTO public.products
  (slug, name, description, category, country_code, duration_days,
   price_monthly_cents, price_yearly_cents, delivery_mode, block_size,
   provider_tariff_id, active, auto_renew_at_provider, notify_expiry_days)
VALUES
  ('ipv4-br', 'IPv4 Dedicado Brasil',
   'Proxy IPv4 dedicado com IP brasileiro. Pedido sob demanda (até 10 minutos para entrega).',
   'ipv4'::product_category, 'BR', 30,
   4990, 49401, 'direct'::delivery_mode, 1,
   '{"countryId":1279,"periodId":"1m","customTargetName":"General use","protocol":"HTTP"}',
   true, true, ARRAY[7,3,1]),
  ('isp-br', 'ISP Residencial Brasil',
   'Proxy ISP residencial estático brasileiro. Pedido sob demanda (até 10 minutos para entrega).',
   'isp'::product_category, 'BR', 30,
   9900, 98010, 'direct'::delivery_mode, 1,
   '{"countryId":5236,"periodId":"1m","customTargetName":"General use","protocol":"HTTP"}',
   true, true, ARRAY[7,3,1])
ON CONFLICT (slug) DO NOTHING;
