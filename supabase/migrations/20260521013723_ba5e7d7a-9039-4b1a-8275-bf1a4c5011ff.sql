
CREATE TABLE IF NOT EXISTS public.proxy_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  latency_ms integer,
  country_seen text,
  source text NOT NULL DEFAULT 'provider',
  error text
);

CREATE INDEX IF NOT EXISTS idx_proxy_metrics_stock_ts
  ON public.proxy_metrics (stock_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_metrics_ts
  ON public.proxy_metrics (ts DESC);

ALTER TABLE public.proxy_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lÃª todas as mÃ©tricas"
ON public.proxy_metrics FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Cliente lÃª mÃ©tricas dos prÃ³prios proxies"
ON public.proxy_metrics FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customer_proxies cp
  WHERE cp.stock_id = proxy_metrics.stock_id
    AND cp.user_id = auth.uid()
));

-- Limpeza automÃ¡tica: apaga snapshots com mais de 30 dias
CREATE OR REPLACE FUNCTION public.prune_proxy_metrics()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.proxy_metrics WHERE ts < now() - interval '30 days';
$$;

-- Agenda jobs (extensions jÃ¡ existem no projeto)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove jobs anteriores com mesmo nome para idempotÃªncia
DO $$
BEGIN
  PERFORM cron.unschedule('proxy-healthcheck-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('proxy-metrics-prune-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'proxy-healthcheck-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/cron/healthcheck',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','CHAVE_ANON_REMOVIDA__COLE_A_CHAVE_DO_PROJETO_ATUAL'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'proxy-metrics-prune-daily',
  '17 3 * * *',
  $$ SELECT public.prune_proxy_metrics(); $$
);
