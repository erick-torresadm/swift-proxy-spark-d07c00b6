-- Restrict sensitive columns from broad role access
REVOKE SELECT (stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id) ON public.products FROM anon, authenticated;

REVOKE SELECT (guest_ip, guest_email, guest_phone) ON public.chat_conversations FROM authenticated;