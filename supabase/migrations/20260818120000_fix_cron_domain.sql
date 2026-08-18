-- Hotfix: pg_cron jobs still POST to the old Lovable preview domain
-- (project--22278c7a-6a44-4eed-8709-90b11bbbb809.lovable.app), which is
-- dead now that the app is deployed on Vercel behind fastproxy.com.br.
-- This breaks proxy delivery: proxyseller-backfill-1min never completes
-- allocations that couldn't be satisfied synchronously in the Stripe
-- webhook, so paid orders get stuck without proxies in customer_proxies.
--
-- Repoints all 7 jobs to https://fastproxy.com.br.

DO $$ BEGIN PERFORM cron.unschedule('proxy-healthcheck-5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('stripe-sync-5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('proxyseller-backfill-1min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('notifications-dispatch-5min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('proxyseller-full-sync-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('renewal-sweep-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('engagement-nudges-reminder-3d'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('email-queue-worker-1min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'proxy-healthcheck-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fastproxy.com.br/api/public/cron/healthcheck',
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
    url := 'https://fastproxy.com.br/api/public/hooks/stripe-sync',
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
    url := 'https://fastproxy.com.br/api/public/hooks/proxyseller-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

SELECT cron.schedule(
  'notifications-dispatch-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fastproxy.com.br/api/public/hooks/notifications-dispatch',
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
    url := 'https://fastproxy.com.br/api/public/hooks/proxyseller-full-sync',
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
    url := 'https://fastproxy.com.br/api/public/hooks/renewal-sweep',
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
    url := 'https://fastproxy.com.br/api/public/hooks/engagement-nudges',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{"kind":"reminder"}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'email-queue-worker-1min',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fastproxy.com.br/api/public/hooks/email-queue-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
