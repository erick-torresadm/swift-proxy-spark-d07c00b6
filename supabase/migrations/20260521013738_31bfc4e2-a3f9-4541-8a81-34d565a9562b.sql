
REVOKE EXECUTE ON FUNCTION public.prune_proxy_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_proxy_metrics() TO postgres, service_role;
