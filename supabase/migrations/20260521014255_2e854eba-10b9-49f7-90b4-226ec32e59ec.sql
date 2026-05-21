
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS display_author_name text NOT NULL DEFAULT 'FastProxy';
