-- Defense-in-depth: revoke column-level SELECT on sensitive columns from anon/authenticated.
REVOKE SELECT (customer_email, stripe_payment_intent_id, stripe_subscription_id, stripe_customer_id, stripe_checkout_session_id)
  ON public.orders FROM anon, authenticated;

REVOKE SELECT (host, port, username, password)
  ON public.proxy_stock FROM anon, authenticated;

-- Ensure service_role retains full access (admins read via server functions using service_role)
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.proxy_stock TO service_role;

COMMENT ON TABLE public.proxy_stock IS
  'Proxy credentials. Customer-facing reads MUST go through customer_proxies via service-role server functions. Any future user-facing SELECT policy MUST join customer_proxies and filter by auth.uid().';