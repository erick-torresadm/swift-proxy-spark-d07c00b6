
CREATE TYPE blog_ad_position AS ENUM ('top', 'middle', 'bottom');

CREATE TABLE public.blog_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position blog_ad_position NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  link_url text NOT NULL,
  html text,
  cta_label text DEFAULT 'Saiba mais',
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  impression_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_ads_active ON public.blog_ads (position, active, starts_at, ends_at);

ALTER TABLE public.blog_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anúncios ativos públicos"
  ON public.blog_ads FOR SELECT
  USING (active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

CREATE POLICY "Equipe gerencia anúncios"
  ON public.blog_ads FOR ALL
  TO authenticated
  USING (can_manage_blog(auth.uid()))
  WITH CHECK (can_manage_blog(auth.uid()));

CREATE TRIGGER trg_blog_ads_updated_at
  BEFORE UPDATE ON public.blog_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- noindex flag for posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS noindex boolean NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS canonical_url text;
