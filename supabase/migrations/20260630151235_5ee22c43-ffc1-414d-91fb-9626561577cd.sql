-- Reschedule pg_cron jobs to authenticate via x-cron-secret instead of the
-- public anon key. The secret value is read from the database GUC
-- `app.cron_secret`, which the project owner sets with:
--   ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET>';
-- and then SELECT pg_reload_conf();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('proxy-healthcheck-5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('stripe-sync-5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('proxyseller-backfill-1min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('notifications-dispatch-5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('proxyseller-full-sync-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('renewal-sweep-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('engagement-nudges-reminder-3d'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'proxy-healthcheck-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/cron/healthcheck',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'stripe-sync-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/stripe-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'proxyseller-backfill-1min',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/proxyseller-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'notifications-dispatch-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/notifications-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'proxyseller-full-sync-hourly',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/proxyseller-full-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'renewal-sweep-daily',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/renewal-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'engagement-nudges-reminder-3d',
  '0 14 */3 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app/api/public/hooks/engagement-nudges',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{"kind":"reminder"}'::jsonb
  );
  $cron$
);
