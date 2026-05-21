REVOKE EXECUTE ON FUNCTION public.get_db_usage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_db_total_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_cleanup(int,int,int,int,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_usage() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_db_total_size() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_cleanup(int,int,int,int,boolean) TO service_role;