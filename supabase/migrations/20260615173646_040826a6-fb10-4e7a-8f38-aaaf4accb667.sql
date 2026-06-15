-- Restrict column-level SELECT on products to hide internal provider/Stripe routing IDs
-- from anon and authenticated. Server-side code uses service_role and is unaffected.
REVOKE SELECT ON public.products FROM anon, authenticated;

GRANT SELECT (
  id, slug, name, description, category, country_code, duration_days,
  price_monthly_cents, price_yearly_cents, delivery_mode, block_size,
  ip_rotations_per_month, active, created_at, updated_at,
  auto_renew_at_provider, notify_expiry_days, restock_threshold
) ON public.products TO anon, authenticated;

-- Service role keeps full access for server functions / admin
GRANT ALL ON public.products TO service_role;