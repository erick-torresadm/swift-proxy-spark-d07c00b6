-- Enums
CREATE TYPE public.post_status AS ENUM ('draft','published','archived');
CREATE TYPE public.comment_status AS ENUM ('visible','hidden','flagged');

-- Categories
CREATE TABLE public.post_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags
CREATE TABLE public.post_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Posts
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content_md TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  status public.post_status NOT NULL DEFAULT 'draft',
  category_id UUID REFERENCES public.post_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  keyword_primary TEXT,
  keywords_secondary TEXT[] NOT NULL DEFAULT '{}',
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  reading_time_minutes INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_status_published ON public.posts(status, published_at DESC);
CREATE INDEX idx_posts_category ON public.posts(category_id);
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Post ↔ Tag
CREATE TABLE public.post_tag_map (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.post_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Comments
CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status public.comment_status NOT NULL DEFAULT 'visible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post ON public.post_comments(post_id, created_at DESC);
CREATE INDEX idx_comments_user ON public.post_comments(user_id, created_at DESC);

-- Programmatic pages
CREATE TABLE public.programmatic_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content_md TEXT NOT NULL DEFAULT '',
  meta_title TEXT,
  meta_description TEXT,
  keyword_primary TEXT,
  keywords_secondary TEXT[] NOT NULL DEFAULT '{}',
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  group_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_programmatic_active ON public.programmatic_pages(active, group_name);
CREATE TRIGGER trg_programmatic_updated_at BEFORE UPDATE ON public.programmatic_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tag_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programmatic_pages ENABLE ROW LEVEL SECURITY;

-- Categories: public read, admin write
CREATE POLICY "Categorias públicas" ON public.post_categories
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin gerencia categorias" ON public.post_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tags: public read, admin write
CREATE POLICY "Tags públicas" ON public.post_tags
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin gerencia tags" ON public.post_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Posts: published público, admin tudo
CREATE POLICY "Posts publicados públicos" ON public.posts
  FOR SELECT TO anon, authenticated
  USING (status = 'published' AND (published_at IS NULL OR published_at <= now()));
CREATE POLICY "Admin gerencia posts" ON public.posts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Post tag map: público leitura, admin escrita
CREATE POLICY "Tag map público" ON public.post_tag_map
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin gerencia tag map" ON public.post_tag_map
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Comments: visíveis públicos, autenticado cria próprio, admin tudo
CREATE POLICY "Comentários visíveis públicos" ON public.post_comments
  FOR SELECT TO anon, authenticated
  USING (status = 'visible' OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Autenticado cria comentário" ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Autor edita o próprio" ON public.post_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admin gerencia comentários" ON public.post_comments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Programmatic pages: active público, admin tudo
CREATE POLICY "Páginas programáticas públicas" ON public.programmatic_pages
  FOR SELECT TO anon, authenticated
  USING (active = true);
CREATE POLICY "Admin gerencia programáticas" ON public.programmatic_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));