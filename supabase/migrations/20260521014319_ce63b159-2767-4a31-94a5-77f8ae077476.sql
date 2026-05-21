
CREATE OR REPLACE FUNCTION public.can_manage_blog(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','editor')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_comments(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','editor','moderator')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','editor','moderator')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_blog(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_moderate_comments(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;

DROP POLICY IF EXISTS "Admin gerencia posts" ON public.posts;
CREATE POLICY "Equipe edita posts" ON public.posts
  FOR ALL TO authenticated
  USING (public.can_manage_blog(auth.uid()))
  WITH CHECK (public.can_manage_blog(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia categorias" ON public.post_categories;
CREATE POLICY "Equipe gerencia categorias" ON public.post_categories
  FOR ALL TO authenticated
  USING (public.can_manage_blog(auth.uid()))
  WITH CHECK (public.can_manage_blog(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia tags" ON public.post_tags;
CREATE POLICY "Equipe gerencia tags" ON public.post_tags
  FOR ALL TO authenticated
  USING (public.can_manage_blog(auth.uid()))
  WITH CHECK (public.can_manage_blog(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia tag map" ON public.post_tag_map;
CREATE POLICY "Equipe gerencia tag map" ON public.post_tag_map
  FOR ALL TO authenticated
  USING (public.can_manage_blog(auth.uid()))
  WITH CHECK (public.can_manage_blog(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia comentários" ON public.post_comments;
CREATE POLICY "Moderadores moderam comentários" ON public.post_comments
  FOR ALL TO authenticated
  USING (public.can_moderate_comments(auth.uid()))
  WITH CHECK (public.can_moderate_comments(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia programáticas" ON public.programmatic_pages;
CREATE POLICY "Equipe gerencia programáticas" ON public.programmatic_pages
  FOR ALL TO authenticated
  USING (public.can_manage_blog(auth.uid()))
  WITH CHECK (public.can_manage_blog(auth.uid()));
