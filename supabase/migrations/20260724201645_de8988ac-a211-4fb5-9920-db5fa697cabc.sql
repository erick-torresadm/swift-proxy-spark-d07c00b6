
-- 1) 1 IP packages for ipv6-br (single payment / pacotes page)
WITH p AS (SELECT id FROM public.products WHERE slug = 'ipv6-br' LIMIT 1)
INSERT INTO public.product_packages
  (product_id, quantity, term_months, price_cents, label, sort_order, active)
SELECT p.id, q.quantity, q.term_months, q.price_cents, q.label, q.sort_order, true
FROM p, (VALUES
  (1,  1,  2990, 'Pack 1 · 1 mês',    1),
  (1,  3,  7990, 'Pack 1 · 3 meses',  2),
  (1,  6, 14900, 'Pack 1 · 6 meses',  3),
  (1, 12, 26900, 'Pack 1 · 12 meses', 4)
) AS q(quantity, term_months, price_cents, label, sort_order)
ON CONFLICT (product_id, quantity, term_months) DO NOTHING;

-- 2) New monthly rotating product: IPv6 Rotativo BR — troca IP a cada 10 min — R$120/mês
INSERT INTO public.products
  (slug, name, description, category, country_code, duration_days,
   price_monthly_cents, price_yearly_cents, delivery_mode,
   block_size, ip_rotations_per_month, active)
VALUES (
  'ipv6-rot-br',
  'IPv6 Rotativo Brasil',
  'IPv6 brasileiro com rotação automática de IP a cada 10 minutos.',
  'ipv6_fb', 'BR', 30,
  12000, 118800, 'stock',
  1, 4320, true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  price_yearly_cents = EXCLUDED.price_yearly_cents,
  ip_rotations_per_month = EXCLUDED.ip_rotations_per_month,
  active = true,
  updated_at = now();
