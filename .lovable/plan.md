## Objetivo

Transformar o blog num formato de leitura profissional (estilo Medium/Stripe Press) com espaçamento, hierarquia e ritmo certos — e reforçar SEO técnico para ajudar o ranqueamento dos posts do seu editor.

Hoje o conteúdo renderiza só com `prose prose-invert` padrão do Tailwind Typography, sem ajustes finos: títulos pequenos, espaçamento apertado, sem destaque em citações, código, imagens, listas ou tabelas. E faltam alguns sinais de SEO/AEO que o Google e o ChatGPT/Perplexity usam pra escolher fontes.

---

## 1) Renderização do artigo (`src/components/blog/markdown-render.tsx` + `blog.$slug.tsx`)

Reescrever as classes do `prose` com tipografia editorial:

- **Largura de leitura ideal:** container `max-w-[68ch]` centralizado (hoje fica fluido e cansa a vista).
- **Hierarquia de títulos:** H1 do post `text-4xl md:text-6xl`, H2 `text-3xl mt-16 mb-5` com linha decorativa, H3 `text-2xl mt-12`, todos com `tracking-tight` e `font-black`.
- **Parágrafos:** `text-[1.0625rem] leading-[1.8] text-foreground/90`, espaçamento `mt-6`, primeira letra do primeiro parágrafo em drop-cap opcional.
- **Lead/excerpt:** parágrafo de abertura maior (`text-xl text-muted-foreground leading-relaxed`) antes do conteúdo.
- **Listas:** marcadores customizados (•/número em primary), `space-y-2`, indentação correta.
- **Blockquotes:** borda esquerda em primary, fundo card sutil, itálico, padding generoso.
- **Code inline e blocos:** fundo card, borda, scroll horizontal, fonte mono, syntax-friendly.
- **Imagens dentro do markdown:** `rounded-2xl`, sombra, legenda (caption) automática quando o alt começa com "—", lazy + `decoding=async`.
- **Tabelas:** wrapper com overflow-x, cabeçalho destacado, zebra rows.
- **Links:** sublinhado underline-offset, cor primary, hover suave.
- **Separadores `---`:** viram um divisor centralizado com 3 pontos (estilo editorial).
- **Ritmo vertical consistente:** `space-y` calibrado entre blocos, sem "paredes de texto".

## 2) Layout da página do post (`src/routes/blog.$slug.tsx`)

- **Header do artigo redesenhado:** categoria → título grande → excerpt como lead → meta (autor, data, tempo de leitura, views) em linha fina.
- **Capa em destaque:** full-bleed acima do conteúdo, com proporção 16/9 e legenda.
- **Sumário (Table of Contents) sticky** na lateral em desktop, gerado a partir dos H2/H3 do markdown — ajuda leitura E SEO (Google usa para sitelinks de jump-to).
- **Barra de progresso de leitura** no topo (componente já existe — `ScrollProgress`).
- **Compartilhar:** botões WhatsApp / X / LinkedIn / copiar link, sticky na lateral em desktop.
- **CTA final** mais elegante (cartão com gradient já está, refinar tipografia).
- **Autor box** no fim do post com nome + foto fallback + bio curta.
- **Posts relacionados** (3 cards) por categoria ou tags abaixo do CTA.

## 3) Index do blog (`src/routes/blog.index.tsx`)

- **Post em destaque** (hero card grande) + grid 2 colunas dos demais — quebra a monotonia do grid uniforme.
- **Cards refinados:** padding maior, hierarquia de tipografia, categoria como pill com cor.
- Mantém busca e filtro de categorias.

## 4) SEO técnico reforçado

No `blog.$slug.tsx`:
- Adicionar **`twitter:creator`**, **`og:locale: pt_BR`**, **`og:site_name`**, **`article:author`**, **`article:section`** (categoria), **`article:tag`** (cada tag).
- **JSON-LD Article**: incluir `wordCount`, `articleBody` (primeiros 500 chars), `inLanguage: pt-BR`, `author` como `Person` quando houver `display_author_name`, `publisher` com `logo`.
- **JSON-LD `Speakable`** (ajuda voice search e Google Discover).
- **`<link rel="prev/next">`** quando houver paginação no index.
- **Imagens com `width`/`height`** explícitos para evitar CLS (Core Web Vitals).
- **Heading única H1** garantido (o título do post é o único H1 da página).
- Sanitização do markdown já existe (`rehype-sanitize`) — manter.
- **`rehype-slug` + `rehype-autolink-headings`** para gerar IDs nos H2/H3 (necessário pro TOC e pra deep-links indexáveis).

No index do blog:
- JSON-LD `Blog` + `ItemList` dos posts visíveis.

## 5) Sitemap

Verificar/ajustar `src/routes/sitemap[.]xml.tsx` para incluir cada post publicado com `lastmod` do `updated_at` — se já existe assim, manter. (Vou checar antes de mexer.)

---

## Detalhes técnicos

- Instalar `rehype-slug` e `rehype-autolink-headings` (passar pro `ReactMarkdown` junto com `rehype-sanitize`, com schema ampliado pra permitir `id` em headings e `class` controlada).
- Drop-cap, TOC, share buttons e author box vão como componentes novos em `src/components/blog/` (TOC.tsx, ShareBar.tsx, AuthorBox.tsx, RelatedPosts.tsx).
- TOC extrai headings via regex do `content_md` (server-safe, sem precisar parsear DOM).
- `RelatedPosts`: nova função em `blog.functions.ts` que busca 3 posts publicados da mesma categoria/tags, ordenados por `published_at desc`, excluindo o atual.
- Cores e radius via tokens existentes em `src/styles.css` — não adicionar cores hardcoded.
- Toda mudança fica em frontend/presentation; nada de mudança no schema do banco.

## Arquivos afetados

- `src/components/blog/markdown-render.tsx` (reescrita das classes)
- `src/routes/blog.$slug.tsx` (layout do post)
- `src/routes/blog.index.tsx` (hero + grid)
- `src/components/blog/toc.tsx` (novo)
- `src/components/blog/share-bar.tsx` (novo)
- `src/components/blog/author-box.tsx` (novo)
- `src/components/blog/related-posts.tsx` (novo)
- `src/lib/blog.functions.ts` (+ função `listRelatedPosts`)
- `package.json` (+ rehype-slug, rehype-autolink-headings)

Quer que eu inclua também uma pré-visualização do mesmo layout dentro do editor admin (aba Preview do `PostForm`) pro seu editor já ver como vai sair publicado?
