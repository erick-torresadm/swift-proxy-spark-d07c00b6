
CREATE TABLE public.product_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'BRL',
  label TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, quantity, term_months)
);

GRANT SELECT ON public.product_packages TO anon;
GRANT SELECT ON public.product_packages TO authenticated;
GRANT ALL ON public.product_packages TO service_role;

ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Público lê pacotes ativos com preço"
  ON public.product_packages FOR SELECT
  USING (active = true AND price_cents IS NOT NULL);

CREATE POLICY "Admin gerencia pacotes"
  ON public.product_packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER product_packages_updated_at
  BEFORE UPDATE ON public.product_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_product_packages_active
  ON public.product_packages (product_id, sort_order)
  WHERE active = true AND price_cents IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.product_packages(id);

CREATE INDEX IF NOT EXISTS orders_package_id_idx ON public.orders (package_id);

-- Seed IPv6 BR fixos (ipv6-br) — grade aprovada
WITH p AS (SELECT id FROM public.products WHERE slug = 'ipv6-br' LIMIT 1)
INSERT INTO public.product_packages
  (product_id, quantity, term_months, price_cents, label, sort_order, active)
SELECT p.id, q.quantity, q.term_months, q.price_cents, q.label, q.sort_order, true
FROM p, (VALUES
  (5,   1,  12900,  'Pack 5 · 1 mês',    10),
  (5,   3,  34900,  'Pack 5 · 3 meses',  11),
  (5,   6,  64900,  'Pack 5 · 6 meses',  12),
  (5,  12, 119000,  'Pack 5 · 12 meses', 13),
  (10,  1,  23900,  'Pack 10 · 1 mês',   20),
  (10,  3,  64900,  'Pack 10 · 3 meses', 21),
  (10,  6, 119900,  'Pack 10 · 6 meses', 22),
  (10, 12, 219000,  'Pack 10 · 12 meses',23),
  (25,  1,  54900,  'Pack 25 · 1 mês',   30),
  (25,  3, 149000,  'Pack 25 · 3 meses', 31),
  (25,  6, 275000,  'Pack 25 · 6 meses', 32),
  (25, 12, 499000,  'Pack 25 · 12 meses',33),
  (50,  1,  99000,  'Pack 50 · 1 mês',   40),
  (50,  3, 269000,  'Pack 50 · 3 meses', 41),
  (50,  6, 499000,  'Pack 50 · 6 meses', 42),
  (50, 12, 899000,  'Pack 50 · 12 meses',43),
  (100, 1, 179000,  'Pack 100 · 1 mês',  50),
  (100, 3, 489000,  'Pack 100 · 3 meses',51),
  (100, 6, 899000,  'Pack 100 · 6 meses',52),
  (100,12,1599000,  'Pack 100 · 12 meses',53)
) AS q(quantity, term_months, price_cents, label, sort_order)
ON CONFLICT (product_id, quantity, term_months) DO NOTHING;

-- Rotativos IPv6 FB BR (ipv6-fb-br) — estrutura sem preço, inativa
WITH p AS (SELECT id FROM public.products WHERE slug = 'ipv6-fb-br' LIMIT 1)
INSERT INTO public.product_packages
  (product_id, quantity, term_months, price_cents, label, sort_order, active)
SELECT p.id, q.quantity, q.term_months, NULL, q.label, q.sort_order, false
FROM p, (VALUES
  (3,   1, 'Pack 3 · 1 mês',    10),
  (3,   3, 'Pack 3 · 3 meses',  11),
  (3,   6, 'Pack 3 · 6 meses',  12),
  (3,  12, 'Pack 3 · 12 meses', 13),
  (5,   1, 'Pack 5 · 1 mês',    20),
  (5,   3, 'Pack 5 · 3 meses',  21),
  (5,   6, 'Pack 5 · 6 meses',  22),
  (5,  12, 'Pack 5 · 12 meses', 23),
  (10,  1, 'Pack 10 · 1 mês',   30),
  (10,  3, 'Pack 10 · 3 meses', 31),
  (10,  6, 'Pack 10 · 6 meses', 32),
  (10, 12, 'Pack 10 · 12 meses',33),
  (25,  1, 'Pack 25 · 1 mês',   40),
  (25,  3, 'Pack 25 · 3 meses', 41),
  (25,  6, 'Pack 25 · 6 meses', 42),
  (25, 12, 'Pack 25 · 12 meses',43)
) AS q(quantity, term_months, label, sort_order)
ON CONFLICT (product_id, quantity, term_months) DO NOTHING;
