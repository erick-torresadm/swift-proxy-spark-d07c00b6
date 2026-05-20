REVOKE EXECUTE ON FUNCTION public.release_expired_grace_proxies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_grace_proxies() TO service_role;