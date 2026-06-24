
-- coupon_redemptions: protect customer_email
REVOKE SELECT (customer_email) ON public.coupon_redemptions FROM anon, authenticated;

-- coupons: protect stripe_coupon_id
REVOKE SELECT (stripe_coupon_id) ON public.coupons FROM anon, authenticated;

-- orders: protect Stripe identifiers
REVOKE SELECT (
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  stripe_subscription_id,
  stripe_customer_id
) ON public.orders FROM anon, authenticated;
