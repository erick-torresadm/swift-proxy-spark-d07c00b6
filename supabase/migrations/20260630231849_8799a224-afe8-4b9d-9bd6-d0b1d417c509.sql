-- Revoke column-level access to sensitive Stripe identifiers from anon/authenticated.
-- These columns must remain accessible to service_role (server-side) only.

REVOKE SELECT (stripe_coupon_id) ON public.coupons FROM anon, authenticated;

REVOKE SELECT (stripe_price_yearly_id, stripe_price_monthly_id, stripe_product_id, provider_tariff_id)
  ON public.products FROM anon, authenticated;
