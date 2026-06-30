
-- Add source tracking + scheduled publish
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS auto_publish_at timestamptz;
CREATE INDEX IF NOT EXISTS posts_auto_publish_idx ON public.posts(auto_publish_at) WHERE status = 'draft' AND auto_publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_source_idx ON public.posts(source) WHERE source IS NOT NULL;

-- Anti-replay nonces
CREATE TABLE IF NOT EXISTS public.blog_ingest_nonces (
  nonce text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.blog_ingest_nonces TO service_role;
ALTER TABLE public.blog_ingest_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all blog_ingest_nonces" ON public.blog_ingest_nonces FOR ALL USING (false) WITH CHECK (false);

-- Rate limiting per IP (sliding window via fixed 10-min buckets)
CREATE TABLE IF NOT EXISTS public.blog_ingest_rate (
  ip text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);
GRANT ALL ON public.blog_ingest_rate TO service_role;
ALTER TABLE public.blog_ingest_rate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all blog_ingest_rate" ON public.blog_ingest_rate FOR ALL USING (false) WITH CHECK (false);

-- Atomic rate-limit increment: returns the count AFTER increment for the current 10-min bucket.
CREATE OR REPLACE FUNCTION public.bump_blog_ingest_rate(_ip text, _window_minutes int DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window timestamptz := date_trunc('minute', now()) - make_interval(mins => (extract(minute from now())::int % _window_minutes));
  v_count int;
BEGIN
  INSERT INTO public.blog_ingest_rate(ip, window_start, count)
  VALUES (_ip, v_window, 1)
  ON CONFLICT (ip, window_start) DO UPDATE SET count = public.blog_ingest_rate.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- Cron: promote scheduled drafts to published (runs every 5 min, SQL-only)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule duplicates if re-running
DO $$ BEGIN
  PERFORM cron.unschedule('blog-auto-publish');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('blog-ingest-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'blog-auto-publish',
  '*/5 * * * *',
  $$
    UPDATE public.posts
       SET status = 'published',
           published_at = COALESCE(published_at, now()),
           auto_publish_at = NULL
     WHERE status = 'draft'
       AND auto_publish_at IS NOT NULL
       AND auto_publish_at <= now();
  $$
);

SELECT cron.schedule(
  'blog-ingest-cleanup',
  '17 * * * *',
  $$
    DELETE FROM public.blog_ingest_nonces WHERE created_at < now() - interval '1 hour';
    DELETE FROM public.blog_ingest_rate WHERE window_start < now() - interval '1 hour';
  $$
);
