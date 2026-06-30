import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Clock, Calendar, ArrowLeft, Tag, User } from "lucide-react";
import { getPostBySlug, getPostAlternates } from "@/lib/blog.functions";
import { MarkdownRender } from "@/components/blog/markdown-render";
import { CommentThread } from "@/components/blog/comment-thread";
import { TableOfContents } from "@/components/blog/toc";
import { ShareBar } from "@/components/blog/share-bar";
import { AuthorBox } from "@/components/blog/author-box";
import { RelatedPosts } from "@/components/blog/related-posts";

const SITE = "https://www.fastproxy.com.br";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getPostBySlug({ data: { slug: params.slug } });
    if (!post) throw notFound();
    const alternates =
      post.kind === "post"
        ? await getPostAlternates({ data: { postId: post.id } })
        : [];
    return { post, alternates };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Artigo" }] };
    const p = loaderData.post;
    const url = `${SITE}/blog/${params.slug}`;
    const title = p.meta_title ?? p.title;
    const desc = p.meta_description ?? p.excerpt ?? "";
    const wordCount = (p.content_md ?? "").trim().split(/\s+/).filter(Boolean).length;
    const authorName = (p as { author_name?: string }).author_name ?? "FastProxy";

    const meta = [
      { title: `${title} — FastProxy` },
      { name: "description", content: desc },
      {
        name: "keywords",
        content: [p.keyword_primary, ...(p.keywords_secondary ?? [])]
          .filter(Boolean)
          .join(", "),
      },
      { name: "author", content: authorName },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "FastProxy" },
      { property: "article:published_time", content: p.published_at ?? "" },
      { property: "article:author", content: authorName },
      ...(p.category ? [{ property: "article:section", content: p.category.name }] : []),
      ...((p.tags ?? []).map((t: { name: string }) => ({
        property: "article:tag",
        content: t.name,
      }))),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    if (p.cover_image_url) {
      meta.push({ property: "og:image", content: p.cover_image_url });
      meta.push({ name: "twitter:image", content: p.cover_image_url });
    }

    const articleBody = (p.content_md ?? "")
      .replace(/[#*`>_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    const ld: Array<Record<string, unknown>> = [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: p.title,
        description: desc,
        image: p.cover_image_url ? [p.cover_image_url] : undefined,
        datePublished: p.published_at,
        dateModified: p.published_at,
        inLanguage: "pt-BR",
        wordCount,
        articleBody,
        author: { "@type": "Person", name: authorName },
        publisher: {
          "@type": "Organization",
          name: "FastProxy",
          logo: { "@type": "ImageObject", url: `${SITE}/favicon.ico` },
        },
        mainEntityOfPage: url,
        speakable: {
          "@type": "SpeakableSpecification",
          cssSelector: ["h1", "h2", "p"],
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: SITE },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
          { "@type": "ListItem", position: 3, name: p.title, item: url },
        ],
      },
    ];
    if (p.faq && p.faq.length > 0) {
      ld.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: p.faq.map((f: { question: string; answer: string }) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts: ld.map((j) => ({
        type: "application/ld+json",
        children: JSON.stringify(j),
      })),
    };
  },
  component: PostPage,
});

function PostPage() {
  const { post } = Route.useLoaderData();
  const url = `${SITE}/blog/${post.slug}`;
  const authorName = (post as { author_name?: string }).author_name ?? "FastProxy";

  return (
    <article className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-12">
      <div className="min-w-0">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para o blog
        </Link>

        {/* HEADER */}
        <header className="max-w-[68ch]">
          {post.category && (
            <Link
              to="/blog/c/$slug"
              params={{ slug: post.category.slug }}
              className="inline-block text-xs uppercase tracking-widest text-primary font-black mb-4"
            >
              {post.category.name}
            </Link>
          )}

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05] mb-6">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="text-xl sm:text-2xl text-muted-foreground leading-relaxed mb-8">
              {post.excerpt}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground pb-6 mb-10 border-b border-border">
            <span className="inline-flex items-center gap-1.5">
              <User className="w-4 h-4" /> {authorName}
            </span>
            {post.published_at && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(post.published_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> {post.reading_time_minutes} min de leitura
            </span>
          </div>
        </header>

        {/* COVER */}
        {post.cover_image_url && (
          <figure className="mb-12">
            <img
              src={post.cover_image_url}
              alt={post.title}
              width={1600}
              height={900}
              className="w-full aspect-[16/9] object-cover rounded-2xl border border-border shadow-xl"
            />
          </figure>
        )}

        {/* TOC mobile */}
        <div className="lg:hidden mb-10 max-w-[68ch]">
          <TableOfContents source={post.content_md} />
        </div>

        {/* CONTENT */}
        <div className="max-w-[68ch]">
          <MarkdownRender source={post.content_md} />

          {/* FAQ */}
          {post.faq && post.faq.length > 0 && (
            <section className="mt-16 pt-10 border-t border-border">
              <h2 className="text-3xl font-black tracking-tight mb-6">
                Perguntas frequentes
              </h2>
              <div className="space-y-3">
                {post.faq.map(
                  (f: { question: string; answer: string }, i: number) => (
                    <details
                      key={i}
                      className="bg-card border border-border rounded-2xl p-5 group"
                    >
                      <summary className="font-bold cursor-pointer list-none flex items-center justify-between gap-4 text-base">
                        {f.question}
                        <span className="text-muted-foreground text-xl group-open:rotate-45 transition shrink-0">
                          +
                        </span>
                      </summary>
                      <p className="text-[15px] text-muted-foreground mt-4 leading-relaxed whitespace-pre-wrap">
                        {f.answer}
                      </p>
                    </details>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mt-12 flex flex-wrap gap-2">
              {post.tags.map((t: { slug: string; name: string }) => (
                <Link
                  key={t.slug}
                  to="/blog/tag/$slug"
                  params={{ slug: t.slug }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-semibold hover:border-primary hover:text-primary transition"
                >
                  <Tag className="w-3 h-3" /> {t.name}
                </Link>
              ))}
            </div>
          )}

          {/* Share */}
          <div className="mt-10 pt-8 border-t border-border flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Achou útil? Compartilhe com quem também usa proxy.
            </p>
            <ShareBar url={url} title={post.title} />
          </div>

          {/* Author */}
          <AuthorBox name={authorName} />

          {/* CTA */}
          <div className="mt-12 rounded-2xl bg-gradient-primary p-8 sm:p-10 text-primary-foreground">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">
              Pronto para começar?
            </h2>
            <p className="text-base opacity-90 mb-6 max-w-md">
              Proxies dedicados IPv6, IPv4 e ISP no Brasil a partir de
              R$29,90/mês. Reposição garantida e suporte humano.
            </p>
            <Link
              to="/"
              hash="planos"
              className="inline-flex px-6 py-3 rounded-xl bg-background text-foreground font-bold text-sm hover:bg-background/90 transition"
            >
              Ver planos
            </Link>
          </div>

          {/* Related */}
          {post.kind === "post" && <RelatedPosts postId={post.id} />}

          {/* Comments */}
          {post.kind === "post" && <CommentThread postId={post.id} />}
        </div>
      </div>

      {/* SIDEBAR (desktop only) */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6">
          <TableOfContents source={post.content_md} />
          <div className="rounded-2xl border border-border bg-card/50 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              Compartilhar
            </p>
            <ShareBar url={url} title={post.title} />
          </div>
        </div>
      </aside>
    </article>
  );
}
