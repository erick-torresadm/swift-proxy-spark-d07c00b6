-- Função para estatísticas de uso do banco (tamanho por tabela)
CREATE OR REPLACE FUNCTION public.get_db_usage()
RETURNS TABLE(
  table_name text,
  total_size_bytes bigint,
  total_size_pretty text,
  row_count bigint,
  dead_rows bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT 
    relname::text AS table_name,
    pg_total_relation_size(relid) AS total_size_bytes,
    pg_size_pretty(pg_total_relation_size(relid))::text AS total_size_pretty,
    n_live_tup AS row_count,
    n_dead_tup AS dead_rows
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(relid) DESC;
$$;

-- Tamanho total do banco
CREATE OR REPLACE FUNCTION public.get_db_total_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT pg_database_size(current_database());
$$;

-- Limpeza configurável (admin-only)
CREATE OR REPLACE FUNCTION public.run_cleanup(
  _audit_days int DEFAULT 30,
  _metrics_days int DEFAULT 7,
  _notifications_days int DEFAULT 30,
  _closed_chats_days int DEFAULT 60,
  _vacuum boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_audit int := 0;
  v_metrics int := 0;
  v_notifs int := 0;
  v_chat_msgs int := 0;
  v_chat_convs int := 0;
  v_health int := 0;
BEGIN
  -- audit_log antigos
  IF _audit_days IS NOT NULL AND _audit_days > 0 THEN
    DELETE FROM public.audit_log WHERE created_at < now() - (_audit_days || ' days')::interval;
    GET DIAGNOSTICS v_audit = ROW_COUNT;
  END IF;

  -- proxy_metrics antigos
  IF _metrics_days IS NOT NULL AND _metrics_days > 0 THEN
    DELETE FROM public.proxy_metrics WHERE ts < now() - (_metrics_days || ' days')::interval;
    GET DIAGNOSTICS v_metrics = ROW_COUNT;
  END IF;

  -- proxy_health_events antigos (mesma janela das metrics)
  IF _metrics_days IS NOT NULL AND _metrics_days > 0 THEN
    DELETE FROM public.proxy_health_events WHERE created_at < now() - (_metrics_days || ' days')::interval;
    GET DIAGNOSTICS v_health = ROW_COUNT;
  END IF;

  -- notifications lidas antigas
  IF _notifications_days IS NOT NULL AND _notifications_days > 0 THEN
    DELETE FROM public.notifications 
    WHERE created_at < now() - (_notifications_days || ' days')::interval
      AND (read_at IS NOT NULL OR created_at < now() - interval '90 days');
    GET DIAGNOSTICS v_notifs = ROW_COUNT;
  END IF;

  -- conversas fechadas antigas (mensagens e conversa)
  IF _closed_chats_days IS NOT NULL AND _closed_chats_days > 0 THEN
    WITH old_convs AS (
      SELECT id FROM public.chat_conversations
      WHERE status = 'closed' 
        AND updated_at < now() - (_closed_chats_days || ' days')::interval
    ), del_msgs AS (
      DELETE FROM public.chat_messages 
      WHERE conversation_id IN (SELECT id FROM old_convs)
      RETURNING 1
    )
    SELECT count(*) INTO v_chat_msgs FROM del_msgs;

    DELETE FROM public.chat_conversations
    WHERE status = 'closed' 
      AND updated_at < now() - (_closed_chats_days || ' days')::interval;
    GET DIAGNOSTICS v_chat_convs = ROW_COUNT;
  END IF;

  -- VACUUM para liberar espaço de fato
  IF _vacuum THEN
    -- VACUUM não roda em função; usamos ANALYZE que atualiza stats
    ANALYZE public.audit_log;
    ANALYZE public.proxy_metrics;
    ANALYZE public.chat_messages;
    ANALYZE public.chat_conversations;
    ANALYZE public.notifications;
  END IF;

  RETURN jsonb_build_object(
    'audit_log_deleted', v_audit,
    'proxy_metrics_deleted', v_metrics,
    'proxy_health_deleted', v_health,
    'notifications_deleted', v_notifs,
    'chat_messages_deleted', v_chat_msgs,
    'chat_conversations_deleted', v_chat_convs,
    'analyzed', _vacuum,
    'ran_at', now()
  );
END;
$$;

-- Restringe execução das functions
REVOKE EXECUTE ON FUNCTION public.get_db_usage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_db_total_size() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_cleanup(int,int,int,int,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_usage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_db_total_size() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_cleanup(int,int,int,int,boolean) TO authenticated, service_role;