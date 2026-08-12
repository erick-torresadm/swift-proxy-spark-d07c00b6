CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('stripe-sync-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('proxyseller-backfill-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('notifications-dispatch-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'stripe-sync-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/stripe-sync',
    headers := '{"Content-Type":"application/json","apikey":"CHAVE_ANON_REMOVIDA__COLE_A_CHAVE_DO_PROJETO_ATUAL"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'proxyseller-backfill-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/proxyseller-backfill',
    headers := '{"Content-Type":"application/json","apikey":"CHAVE_ANON_REMOVIDA__COLE_A_CHAVE_DO_PROJETO_ATUAL"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'notifications-dispatch-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/notifications-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"CHAVE_ANON_REMOVIDA__COLE_A_CHAVE_DO_PROJETO_ATUAL"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);