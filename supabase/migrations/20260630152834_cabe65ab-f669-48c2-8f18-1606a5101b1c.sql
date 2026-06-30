
-- 1) PRODUCTS: stop exposing stripe_* columns to anonymous Data API callers.
-- Replace the public policy with an authenticated-only policy and revoke anon
-- SELECT on the table. Public catalog reads continue via server functions
-- (catalog.functions.ts) using the admin client with explicit column lists.
DROP POLICY IF EXISTS "Catálogo público" ON public.products;

REVOKE SELECT ON public.products FROM anon;

CREATE POLICY "Catálogo autenticado"
ON public.products
FOR SELECT
TO authenticated
USING (active = true OR app_private.has_role(auth.uid(), 'admin'::app_role));

-- Public, anon-safe view exposing ONLY catalog columns (no stripe_* IDs).
CREATE OR REPLACE VIEW public.products_public
WITH (security_invoker = true) AS
SELECT id, slug, name, description, category, country_code, duration_days,
       price_monthly_cents, price_yearly_cents, delivery_mode, block_size,
       ip_rotations_per_month, active
FROM public.products
WHERE active = true;

GRANT SELECT ON public.products_public TO anon, authenticated;

-- 2) ORDERS: allow each customer to read their own order (safe columns only).
-- Revoke broad authenticated SELECT and grant column-level SELECT that
-- excludes all stripe_* identifiers. Admins continue using the existing
-- "Admin gerencia pedidos" ALL policy via service role / admin client.
REVOKE SELECT ON public.orders FROM authenticated;
GRANT SELECT (
  id, user_id, product_id, quantity, billing_cycle, amount_cents, status,
  current_period_end, grace_until, last_payment_check_at,
  created_at, updated_at, promo_code, discount_cents,
  customer_email, customer_name
) ON public.orders TO authenticated;

CREATE POLICY "Cliente vê próprios pedidos"
ON public.orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
