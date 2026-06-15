-- 1) post_comments: prevent moderation bypass on self-update
DROP POLICY IF EXISTS "Autor edita o próprio" ON public.post_comments;

CREATE POLICY "Autor edita o próprio"
ON public.post_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status = 'visible'::comment_status
);

-- 2) products: hide provider_tariff_id from anon and authenticated
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM authenticated;

GRANT SELECT (
  id, slug, name, description, category, country_code, duration_days,
  price_monthly_cents, price_yearly_cents, delivery_mode, block_size,
  ip_rotations_per_month, active, created_at, updated_at,
  stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id,
  auto_renew_at_provider, notify_expiry_days, restock_threshold
) ON public.products TO anon;

GRANT SELECT (
  id, slug, name, description, category, country_code, duration_days,
  price_monthly_cents, price_yearly_cents, delivery_mode, block_size,
  ip_rotations_per_month, active, created_at, updated_at,
  stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id,
  auto_renew_at_provider, notify_expiry_days, restock_threshold
) ON public.products TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;