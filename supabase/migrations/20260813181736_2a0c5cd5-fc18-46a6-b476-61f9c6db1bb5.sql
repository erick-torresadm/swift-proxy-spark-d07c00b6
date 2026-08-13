-- Novos ciclos de assinatura: Trimestral (quarterly) e Semestral (semiannual)
-- Preços por ciclo em products. Nulos = ciclo não disponível para o produto.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_quarterly_cents int,
  ADD COLUMN IF NOT EXISTS price_semiannual_cents int,
  ADD COLUMN IF NOT EXISTS stripe_price_quarterly_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_semiannual_id text;

-- Preenche ciclos novos automaticamente a partir do mensal com desconto padrão
-- (mesma progressão já usada para o anual: mensal × 3 × 0.875 / × 6 × 0.85).
UPDATE public.products
SET price_quarterly_cents = round(price_monthly_cents * 3 * 0.875),
    price_semiannual_cents = round(price_monthly_cents * 6 * 0.85)
WHERE price_monthly_cents IS NOT NULL
  AND (price_quarterly_cents IS NULL OR price_semiannual_cents IS NULL);
