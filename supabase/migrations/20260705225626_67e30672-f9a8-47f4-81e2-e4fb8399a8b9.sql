
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);

GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.rate_limit_hits FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.bump_rate_hit(_bucket text, _key text, _window_seconds integer, _limit integer)
RETURNS TABLE(allowed boolean, count integer, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket_size interval := make_interval(secs => _window_seconds);
  v_now timestamptz := now();
  v_window timestamptz := to_timestamp(floor(extract(epoch from v_now) / _window_seconds) * _window_seconds);
  v_count int;
BEGIN
  INSERT INTO public.rate_limit_hits(bucket, key, window_start, count)
  VALUES (_bucket, _key, v_window, 1)
  ON CONFLICT (bucket, key, window_start) DO UPDATE SET count = public.rate_limit_hits.count + 1
  RETURNING public.rate_limit_hits.count INTO v_count;

  DELETE FROM public.rate_limit_hits WHERE window_start < v_now - interval '1 day';

  RETURN QUERY SELECT
    (v_count <= _limit),
    v_count,
    GREATEST(0, _window_seconds - extract(epoch from v_now - v_window)::int);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_rate_hit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_rate_hit(text, text, integer, integer) TO service_role, authenticated;
