REVOKE EXECUTE ON FUNCTION public.bump_blog_ingest_rate(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_blog_ingest_rate(text, int) TO service_role;