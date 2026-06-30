create table public.post_translations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  locale text not null check (locale in ('en','es','de','fr','it','nl','ja')),
  slug text not null,
  title text not null,
  content_md text not null,
  meta_title text,
  meta_description text,
  excerpt text,
  keyword_primary text,
  keywords_secondary jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  cover_image_url text,
  reading_time_minutes integer,
  display_author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, locale),
  unique (locale, slug)
);

grant select on public.post_translations to anon, authenticated;
grant all on public.post_translations to service_role;

alter table public.post_translations enable row level security;

create policy "public can read translations of published posts"
on public.post_translations for select
to anon, authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_translations.post_id
      and p.status = 'published'
      and (p.published_at is null or p.published_at <= now())
  )
);

create index post_translations_locale_slug_idx on public.post_translations (locale, slug);
create index post_translations_post_id_idx on public.post_translations (post_id);

create trigger post_translations_set_updated_at
  before update on public.post_translations
  for each row execute function public.update_updated_at_column();