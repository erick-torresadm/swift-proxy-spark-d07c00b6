import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Clock, Calendar, ArrowLeft, Tag } from "lucide-react";
import { getPostBySlug } from "@/lib/blog.functions";
import { MarkdownRender } from "@/components/blog/markdown-render";
import { CommentThread } from "@/components/blog/comment-thread";

const SITE = "https://www.fastproxy.com.br";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getPostBySlug({ data: { slug: params.slug } });
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Artigo" }] };
    const p = loaderData.post;
    const url = `${SITE}/blog/${params.slug}`;
    const title = p.meta_title ?? p.title;
    const desc = p.meta_description ?? p.excerpt ?? "";
    const meta = [
      { title: `${title} — FastProxy` },
      { name: "description", content: desc },
      { name: "keywords", content: [p.keyword_primary, ...(p.keywords_secondary ?? [])].filter(Boolean).join(", ") },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { property: "article:published_time", content: p.published_at ?? "" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    if (p.cover_image_url) {
      meta.push({ property: "og:image", content: p.cover_image_url });
      meta.push({ name: "twitter:image", content: p.cover_image_url });
    }
    const ld: Array<Record<string, unknown>> = [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: p.title,
        description: desc,
        image: p.cover_image_url ? [p.cover_image_url] : undefined,
        datePublished: p.published_at,
        author: { "@type": "Organization", name: "FastProxy" },
        publisher: { "@type": "Organization", name: "FastProxy" },
        mainEntityOfPage: url,
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
        mainEntity: p.faq.map((f) => ({
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

  return (
    <article>
      <Link
        to="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para o blog
      </Link>

      {post.category && (
        <Link
          to="/blog/c/$slug"
          params={{ slug: post.category.slug }}
          className="inline-block text-xs uppercase tracking-widest text-primary font-black mb-3"
        >
          {post.category.name}
        </Link>
      )}

      <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
        {post.title}
      </h1>

      {post.excerpt && (
        <p className="text-lg text-muted-foreground mb-6">{post.excerpt}</p>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border">
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

      {post.cover_image_url && (
        <img
          src={post.cover_image_url}
          alt={post.title}
          className="w-full aspect-[16/9] object-cover rounded-2xl mb-10"
        />
      )}

      <MarkdownRender source={post.content_md} />

      {post.faq && post.faq.length > 0 && (
        <section className="mt-12 pt-8 border-t border-border">
          <h2 className="text-2xl font-black mb-6">Perguntas frequentes</h2>
          <div className="space-y-4">
            {post.faq.map((f: { question: string; answer: string }, i: number) => (
              <details
                key={i}
                className="bg-card border border-border rounded-2xl p-4 group"
              >
                <summary className="font-bold cursor-pointer list-none flex items-center justify-between">
                  {f.question}
                  <span className="text-muted-foreground group-open:rotate-45 transition">+</span>
                </summary>
                <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                  {f.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {post.tags.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-2">
          {post.tags.map((t: { slug: string; name: string }) => (
            <Link
              key={t.slug}
              to="/blog/tag/$slug"
              params={{ slug: t.slug }}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-card border border-border text-xs font-semibold hover:border-primary hover:text-primary transition"
            >
              <Tag className="w-3 h-3" /> {t.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-12 rounded-2xl bg-gradient-primary p-6 sm:p-8 text-primary-foreground">
        <h3 className="text-xl font-black mb-2">Pronto para começar?</h3>
        <p className="text-sm opacity-90 mb-4">
          Proxies dedicados IPv6, IPv4 e ISP no Brasil a partir de R$29,90/mês.
        </p>
        <Link
          to="/"
          hash="planos"
          className="inline-flex px-5 py-2.5 rounded-xl bg-background text-foreground font-bold text-sm hover:bg-background/90 transition"
        >
          Ver planos
        </Link>
      </div>

      {post.kind === "post" && <CommentThread postId={post.id} />}
    </article>
  );
}
