
-- 1. Restrict Realtime channel subscriptions: only allow subscribing to topics matching the user's own conversation IDs
-- No Supabase padrao o schema realtime pertence ao sistema (supabase_realtime_admin), entao pula sem erro.
DO $$
BEGIN
  BEGIN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users subscribe to own chat topics" ON realtime.messages;
    CREATE POLICY "Users subscribe to own chat topics"
    ON realtime.messages FOR SELECT
    TO authenticated
    USING (
      -- Admins see all
      public.has_role(auth.uid(), 'admin')
      OR
      -- Topic must be a conversation id owned by the user
      EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id::text = realtime.topic()
          AND c.user_id = auth.uid()
      )
    );
  EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
    RAISE NOTICE 'realtime.messages pertence ao sistema; politica de chat ignorada (comportamento padrao do Supabase).';
  END;
END $$;

-- 2. Revoke EXECUTE on privileged SECURITY DEFINER functions from authenticated/anon
REVOKE EXECUTE ON FUNCTION public.release_expired_grace_proxies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_db_usage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_db_total_size() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_proxy_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_cleanup(integer, integer, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_uses(uuid) FROM PUBLIC, anon, authenticated;
