# Blog editorial + programmatic SEO

Construir um sistema de conteúdo no FastProxy com 3 camadas: blog editorial gerenciado pelo admin, páginas programáticas geradas por template a partir de combinações reais, e comentários de clientes autenticados. Tudo white-hat — sem doorway pages, sem cloaking.

## Decisão de URL (importante)

Você escolheu `blog.fastproxy.com` (subdomínio) pro futuro. Recomendação técnica: **manter em `/blog` no domínio principal** por enquanto.

Razão: subdomínio é tratado pelo Google como site separado — a autoridade que o FastProxy.app construir não passa pro blog, e vice-versa. Quase todos os players de SaaS de alta autoridade SEO (Stripe, Vercel, Wise, Resend) usam `domínio.com/blog`, não subdomínio.

O plano implementa em `/blog` agora. Mover pra subdomínio depois é 1 redirect 301 — não perdemos nada.

## 1. Schema do banco

```text
post_categories
  id, slug (unique), name, description, created_at

posts
  id, slug (unique), title, excerpt, content_md (markdown),
  cover_image_url, status ('draft'|'published'|'archived'),
  category_id, author_id (auth.users), published_at, created_at, updated_at,
  meta_title, meta_description,
  keyword_primary, keywords_secondary (text[]),
  reading_time_minutes, view_count,
  faq jsonb (array de {question, answer} pro schema FAQPage)

post_tags
  id, slug (unique), name

post_tag_map
  post_id, tag_id

post_comments
  id, post_id, user_id, body, status ('visible'|'hidden'|'flagged'),
  parent_id (pra replies), created_at

programmatic_templates
  id, slug_pattern (ex: "proxy-{country}"), title_pattern,
  description_pattern, content_template (markdown com placeholders),
  variable_set jsonb (lista de combinações), active, created_at

programmatic_pages (gerado a partir do template)
  id, template_id, slug (unique), variables jsonb, generated_at
```

RLS:
- `posts`: SELECT público quando `status='published'`; admin gerencia tudo.
- `post_comments`: SELECT público quando `status='visible'`; INSERT por usuário autenticado (user_id = auth.uid()); admin modera.
- `programmatic_pages`: SELECT público; admin gerencia.

## 2. CMS no admin (`/admin/blog`)

Rotas novas:
- `/admin/blog` — lista de posts, filtros por status/categoria, busca
- `/admin/blog/novo` — editor de novo post
- `/admin/blog/$id/editar` — editor com preview lado-a-lado
- `/admin/blog/categorias` — CRUD de categorias e tags
- `/admin/blog/comentarios` — moderação (aprovar / ocultar / excluir / banir usuário)
- `/admin/blog/programmatic` — gerenciador de templates programáticos

Editor de post (campos):
- **Conteúdo:** título, slug (auto-gerado, editável), excerpt, capa (upload via storage), markdown body com toolbar e preview, FAQ (lista add/remove)
- **Taxonomia:** categoria, tags (multi-select com criação inline)
- **SEO avançado:**
  - meta_title (60 char counter, fallback = title)
  - meta_description (160 char counter, fallback = excerpt)
  - keyword primária + secundárias (chips)
  - OG image (default = capa)
  - canonical URL (opcional, pra evitar duplicado se republicar de outro lugar)
  - JSON-LD preview (Article + FAQPage + BreadcrumbList) renderizado em tempo real
  - Análise de legibilidade simples: contagem de palavras, densidade da keyword primária, presença em title/h1/primeiros 100 chars
- **Publicação:** status, agendamento (`published_at` futuro = draft até a data)

## 3. Páginas públicas do blog (`/blog`)

- `/blog` — landing com posts em destaque, categorias, busca, paginação
- `/blog/c/$categoria` — listagem por categoria (próprio head + JSON-LD CollectionPage)
- `/blog/tag/$tag` — listagem por tag
- `/blog/$slug` — post individual com:
  - Renderização markdown segura (DOMPurify + remark-gfm)
  - Table of Contents automático (headings h2/h3)
  - Tempo de leitura, autor, data
  - FAQ accordion (também como JSON-LD FAQPage)
  - Posts relacionados (mesma categoria/tags)
  - Botões de compartilhamento (Twitter/X, LinkedIn, WhatsApp, copiar link)
  - **Seção de comentários** (próxima seção)
  - CTA contextual ("Comece a usar proxies no FastProxy")

## 4. SEO técnico (white-hat, escala máxima)

Por post:
- `head()` com `title`, `description`, `og:title`, `og:description`, `og:image`, `og:type=article`, `article:published_time`, `article:author`, `twitter:card=summary_large_image`
- `<link rel="canonical">` no leaf (regra TanStack)
- JSON-LD `Article` + `BreadcrumbList` + `FAQPage` (quando houver FAQ)
- Imagens com `alt` obrigatório (validado no editor); `loading="lazy"`
- Headings semânticos (h1 único = título; h2/h3 do markdown)
- Internal linking automático: ao salvar, escaneia o texto por menções a outros slugs e sugere links

Sitewide:
- `/sitemap.xml` — server route que lista todos os posts publicados + páginas programáticas + rotas estáticas, com `<lastmod>` real
- `/sitemap-posts.xml` e `/sitemap-programmatic.xml` separados se passar de 500 URLs
- `/rss.xml` — feed RSS dos últimos 30 posts
- `/robots.txt` — `Allow: /` + referência ao sitemap (já tem, conferir)
- `hreflang` se algum dia tiver versão em inglês (não agora)

## 5. Programmatic SEO

Sistema baseado em template + variável → gera centenas de páginas reais e indexáveis.

Exemplos iniciais (admin pode criar mais):

| Template slug | Variável | Páginas geradas |
| --- | --- | --- |
| `proxy-{country}` | 50 países | `/blog/proxy-brasil`, `/blog/proxy-estados-unidos`… |
| `proxy-para-{use_case}` | scraping, instagram, tiktok, sneakers, ads… | `/blog/proxy-para-scraping`, `/blog/proxy-para-instagram`… |
| `{type_a}-vs-{type_b}` | ipv4/ipv6/isp/residencial | `/blog/ipv6-vs-ipv4`, `/blog/residencial-vs-datacenter`… |
| `proxy-no-{ferramenta}` | selenium, playwright, scrapy, multilogin, dolphin… | `/blog/proxy-no-selenium`… |
| `alternativa-{concorrente}` | brightdata, smartproxy, oxylabs… | `/blog/alternativa-brightdata`… |

Como funciona:
- Admin cria 1 template com markdown contendo `{variável}` + descrição do conjunto de valores (JSON)
- Botão "Gerar" cria 1 `programmatic_pages` por combinação, com slug e variáveis materializadas
- Rota `/blog/$slug` resolve tanto `posts` quanto `programmatic_pages` (busca em ambas)
- Cada página renderizada tem head próprio derivado das variáveis
- Páginas programáticas entram no sitemap

Diferencial vs doorway: o conteúdo gerado é **real e útil** (especificações do produto, link pra comprar aquele tipo, comparativo verdadeiro). Não há promessa falsa.

## 6. Comentários (clientes autenticados)

- Formulário visível só pra logados (CTA "Entre pra comentar" pros anônimos)
- Markdown leve permitido (negrito, itálico, link, code), sanitizado
- Replies em 1 nível (parent_id)
- Rate limit: max 5 comentários por hora por usuário
- Moderação:
  - Admin vê fila em `/admin/blog/comentarios`
  - Pode ocultar, excluir, ou banir usuário (flag no profile)
- Notificação: autor do comentário recebe push quando alguém responde (usa o sistema PWA já existente)
- SEO bonus: comentários renderizam server-side dentro do post, gerando conteúdo de cauda longa real

## 7. Estratégia de "curiosidade" lícita (substituto da doorway)

Implementar 3 padrões que despertam clique sem enganar:

1. **Títulos de problema + solução parcial:** "Por que sua conta de Instagram cai usando proxy datacenter (e como evitar)" — entrega o conteúdo prometido
2. **Comparativos diretos:** "BrightData vs FastProxy: 7 testes reais" — atrai busca por concorrente
3. **Listas com número:** "12 erros comuns ao escolher proxy IPv6" — alta CTR no SERP

Nada de "clickbait sem entrega" — Google rastreia tempo na página e pogo-sticking e pune isso.

## 8. Arquivos a criar

**Migration:**
- `supabase/migrations/<timestamp>_blog.sql` — todas as tabelas + RLS + índices

**Server functions (`src/lib/`):**
- `blog.functions.ts` — list/get post público, list categorias/tags, list relacionados, resolve slug (post ou programmatic), incrementar view_count
- `blog-admin.functions.ts` — CRUD posts/categorias/tags/templates/programmatic, moderação de comentários (todas com `requireSupabaseAuth` + check de admin)
- `blog-comments.functions.ts` — listar/criar/responder/marcar comentário

**Rotas públicas (`src/routes/`):**
- `blog.tsx` — layout do blog (header próprio, sidebar de categorias)
- `blog.index.tsx` — landing do blog
- `blog.c.$slug.tsx` — categoria
- `blog.tag.$slug.tsx` — tag
- `blog.$slug.tsx` — post (resolve post OU programmatic page)
- `sitemap[.]xml.tsx` — sitemap dinâmico
- `rss[.]xml.tsx` — feed RSS

**Rotas admin (`src/routes/_authenticated.admin.*`):**
- `blog.tsx`, `blog.index.tsx`, `blog.novo.tsx`, `blog.$id.editar.tsx`
- `blog.categorias.tsx`, `blog.comentarios.tsx`, `blog.programmatic.tsx`

**Componentes (`src/components/blog/`):**
- `markdown-editor.tsx` — textarea com toolbar e preview (react-markdown + remark-gfm)
- `markdown-render.tsx` — renderer seguro (DOMPurify)
- `seo-fields.tsx` — bloco reutilizável de campos SEO com contadores
- `seo-preview.tsx` — preview do snippet Google + OG card
- `comment-thread.tsx`, `comment-form.tsx`
- `post-card.tsx`, `category-pill.tsx`, `share-buttons.tsx`, `table-of-contents.tsx`
- `programmatic-template-editor.tsx`

**Atualizar:**
- `src/routes/_authenticated.admin.tsx` — adicionar "Blog" no menu admin
- `src/routes/__root.tsx` — link "Blog" no header público
- `src/routes/_authenticated.dashboard.notificacoes.tsx` — sem mudança, mas push de "respondeu seu comentário" usa a infra existente
- `public/robots.txt` — referência ao sitemap se não houver

**Dependências novas:**
- `react-markdown`, `remark-gfm`, `rehype-raw`, `rehype-sanitize`, `isomorphic-dompurify`, `reading-time`

## 9. Fora do escopo (deixar pra depois)

- Newsletter (RSS + Resend posterior)
- Autor multi-pessoa (por ora todos os posts saem como FastProxy)
- I18n / versão em inglês
- AMP (Google descontinuou em 2024)
- Migração pra subdomínio `blog.fastproxy.com` — 1 redirect 301 quando você decidir
- Geração de rascunho por IA — você optou por manual

## 10. Cuidados de segurança

- Markdown sanitizado server-side antes de salvar e client-side ao renderizar (defesa em camadas)
- Comentários passam por mesmo sanitizer + filtro de spam básico (link count, palavras-chave)
- Rate limit em comentários e em incrementos de view_count
- Slug validado regex `^[a-z0-9-]+$`
- Upload de capa via storage bucket privado com URL assinada pública só pra publicados
- Admin check em TODA serverFn de mutação (`has_role(auth.uid(), 'admin')`)

Pronto pra implementar — começo pela migration + server fns públicos, depois o frontend público, depois o admin CMS, depois programmatic e comentários. Quer que eu faça em fases (entrego o público primeiro) ou tudo de uma vez?
