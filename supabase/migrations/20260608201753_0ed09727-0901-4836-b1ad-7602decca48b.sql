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
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwaXRuanp1bHFxeXF4aWtldHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDM1NTcsImV4cCI6MjA5NDg3OTU1N30.4LFcofa4VNpgNOfxqDXOJ9ZuGkKUFaE-1jff5lHPjSs"}'::jsonb,
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
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwaXRuanp1bHFxeXF4aWtldHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDM1NTcsImV4cCI6MjA5NDg3OTU1N30.4LFcofa4VNpgNOfxqDXOJ9ZuGkKUFaE-1jff5lHPjSs"}'::jsonb,
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
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwaXRuanp1bHFxeXF4aWtldHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDM1NTcsImV4cCI6MjA5NDg3OTU1N30.4LFcofa4VNpgNOfxqDXOJ9ZuGkKUFaE-1jff5lHPjSs"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);