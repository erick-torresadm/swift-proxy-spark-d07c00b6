ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS promo_code text,
  ADD COLUMN IF NOT EXISTS discount_cents integer DEFAULT 0 NOT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_monthly_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_yearly_id text;

CREATE INDEX IF NOT EXISTS orders_stripe_session_idx ON public.orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS orders_stripe_sub_idx ON public.orders(stripe_subscription_id);