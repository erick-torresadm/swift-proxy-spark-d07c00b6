import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Clock, Calendar, ArrowLeft, Tag, User } from "lucide-react";
import { getTranslatedPostBySlug } from "@/lib/blog.functions";
import { MarkdownRender } from "@/components/blog/markdown-render";
import { TableOfContents } from "@/components/blog/toc";
import { ShareBar } from "@/components/blog/share-bar";
import { AuthorBox } from "@/components/blog/author-box";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

const SITE = "https://www.fastproxy.com.br";
const ALLOWED = new Set(["en", "es", "de", "fr", "it", "nl", "ja"]);

const LOCALE_META: Record<string, { ogLocale: string; htmlLang: string; backLabel: string; minRead: string; faqTitle: string; shareLabel: string; ctaTitle: string; ctaBody: string; ctaCta: string }> = {
  en: { ogLocale: "en_US", htmlLang: "en", backLabel: "Back to blog", minRead: "min read", faqTitle: "Frequently asked questions", shareLabel: "Share", ctaTitle: "Ready to start?", ctaBody: "Dedicated IPv6, IPv4 and ISP proxies from Brazil. Replacement guaranteed and human support.", ctaCta: "See plans" },
  es: { ogLocale: "es_ES", htmlLang: "es", backLabel: "Volver al blog", minRead: "min de lectura", faqTitle: "Preguntas frecuentes", shareLabel: "Compartir", ctaTitle: "¿Listo para empezar?", ctaBody: "Proxies dedicados IPv6, IPv4 e ISP. Reemplazo garantizado y soporte humano.", ctaCta: "Ver planes" },
  de: { ogLocale: "de_DE", htmlLang: "de", backLabel: "Zurück zum Blog", minRead: "Min Lesezeit", faqTitle: "Häufig gestellte Fragen", shareLabel: "Teilen", ctaTitle: "Bereit loszulegen?", ctaBody: "Dedizierte IPv6-, IPv4- und ISP-Proxys. Garantierter Ersatz und Live-Support.", ctaCta: "Tarife ansehen" },
  fr: { ogLocale: "fr_FR", htmlLang: "fr", backLabel: "Retour au blog", minRead: "min de lecture", faqTitle: "Questions fréquentes", shareLabel: "Partager", ctaTitle: "Prêt à démarrer ?", ctaBody: "Proxies dédiés IPv6, IPv4 et ISP. Remplacement garanti et support humain.", ctaCta: "Voir les plans" },
  it: { ogLocale: "it_IT", htmlLang: "it", backLabel: "Torna al blog", minRead: "min di lettura", faqTitle: "Domande frequenti", shareLabel: "Condividi", ctaTitle: "Pronto per iniziare?", ctaBody: "Proxy dedicati IPv6, IPv4 e ISP. Sostituzione garantita e supporto umano.", ctaCta: "Vedi i piani" },
  nl: { ogLocale: "nl_NL", htmlLang: "nl", backLabel: "Terug naar blog", minRead: "min leestijd", faqTitle: "Veelgestelde vragen", shareLabel: "Delen", ctaTitle: "Klaar om te beginnen?", ctaBody: "Dedicated IPv6-, IPv4- en ISP-proxies. Vervanging gegarandeerd en menselijke support.", ctaCta: "Bekijk abonnementen" },
  ja: { ogLocale: "ja_JP", htmlLang: "ja", backLabel: "ブログに戻る", minRead: "分で読めます", faqTitle: "よくある質問", shareLabel: "シェア", ctaTitle: "始める準備はできましたか?", ctaBody: "ブラジル発の専用 IPv6/IPv4/ISP プロキシ。交換保証と有人サポート。", ctaCta: "プランを見る" },
};

export const Route = createFileRoute("/$locale/blog/$slug")({
  loader: async ({ params }) => {
    if (!ALLOWED.has(params.locale)) throw notFound();
    const post = await getTranslatedPostBySlug({
      data: { locale: params.locale as "en", slug: params.slug },
    });
    if (!post) throw notFound();
    return { post, locale: params.locale };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Article" }] };
    const { post } = loaderData;
    const locale = params.locale;
    const cfg = LOCALE_META[locale] ?? LOCALE_META.en;
    const url = `${SITE}/${locale}/blog/${params.slug}`;
    const title = post.meta_title ?? post.title;
    const desc = post.meta_description ?? post.excerpt ?? "";

    const meta = [
      { title: `${title} — FastProxy` },
      { name: "description", content: desc },
      {
        name: "keywords",
        content: [post.keyword_primary, ...(post.keywords_secondary ?? [])]
          .filter(Boolean)
          .join(", "),
      },
      { name: "author", content: post.author_name },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { property: "og:locale", content: cfg.ogLocale },
      { property: "og:site_name", content: "FastProxy" },
      { property: "article:published_time", content: post.published_at ?? "" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ];
    if (post.cover_image_url) {
      meta.push({ property: "og:image", content: post.cover_image_url });
      meta.push({ name: "twitter:image", content: post.cover_image_url });
    }

    // hreflang alternates — list every language + x-default → PT
    const links: Array<{ rel: string; href: string; hrefLang?: string }> = [
      { rel: "canonical", href: url },
      { rel: "alternate", hrefLang: "x-default", href: `${SITE}/blog/${post.pt_slug}` },
    ];
    for (const a of post.alternates) {
      links.push({
        rel: "alternate",
        hrefLang: a.locale === "pt" ? "pt-BR" : a.locale,
        href: a.locale === "pt" ? `${SITE}/blog/${a.slug}` : `${SITE}/${a.locale}/blog/${a.slug}`,
      });
    }

    const articleBody = (post.content_md ?? "")
      .replace(/[#*`>_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    const wordCount = (post.content_md ?? "").trim().split(/\s+/).filter(Boolean).length;

    const ld: Array<Record<string, unknown>> = [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: desc,
        image: post.cover_image_url ? [post.cover_image_url] : undefined,
        datePublished: post.published_at,
        dateModified: post.published_at,
        inLanguage: cfg.htmlLang,
        wordCount,
        articleBody,
        author: { "@type": "Person", name: post.author_name },
        publisher: {
          "@type": "Organization",
          name: "FastProxy",
          logo: { "@type": "ImageObject", url: `${SITE}/favicon.ico` },
        },
        mainEntityOfPage: url,
      },
    ];
    if (post.faq && post.faq.length > 0) {
      ld.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      });
    }

    return {
      meta,
      links,
      scripts: ld.map((j) => ({
        type: "application/ld+json",
        children: JSON.stringify(j),
      })),
    };
  },
  component: TranslatedPostPage,
});

function TranslatedPostPage() {
  const { post, locale } = Route.useLoaderData();
  const cfg = LOCALE_META[locale] ?? LOCALE_META.en;
  const url = `${SITE}/${locale}/blog/${post.slug}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 sm:pt-32 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <article className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-12">
            <div className="min-w-0">
              <Link
                to="/$locale/blog"
                params={{ locale }}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8"
              >
                <ArrowLeft className="w-4 h-4" /> {cfg.backLabel}
              </Link>

              <header className="max-w-[68ch]">
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
                    <User className="w-4 h-4" /> {post.author_name}
                  </span>
                  {post.published_at && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {new Date(post.published_at).toLocaleDateString(cfg.htmlLang, {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> {post.reading_time_minutes} {cfg.minRead}
                  </span>
                </div>
              </header>

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

              <div className="lg:hidden mb-10 max-w-[68ch]">
                <TableOfContents source={post.content_md} />
              </div>

              <div className="max-w-[68ch]">
                <MarkdownRender source={post.content_md} />

                {post.faq && post.faq.length > 0 && (
                  <section className="mt-16 pt-10 border-t border-border">
                    <h2 className="text-3xl font-black tracking-tight mb-6">{cfg.faqTitle}</h2>
                    <div className="space-y-3">
                      {post.faq.map((f, i) => (
                        <details key={i} className="bg-card border border-border rounded-2xl p-5 group">
                          <summary className="font-bold cursor-pointer list-none flex items-center justify-between gap-4 text-base">
                            {f.question}
                            <span className="text-muted-foreground text-xl group-open:rotate-45 transition shrink-0">+</span>
                          </summary>
                          <p className="text-[15px] text-muted-foreground mt-4 leading-relaxed whitespace-pre-wrap">
                            {f.answer}
                          </p>
                        </details>
                      ))}
                    </div>
                  </section>
                )}

                {post.tags.length > 0 && (
                  <div className="mt-12 flex flex-wrap gap-2">
                    {post.tags.map((t) => (
                      <span
                        key={t.slug}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-semibold"
                      >
                        <Tag className="w-3 h-3" /> {t.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-10 pt-8 border-t border-border flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">{cfg.shareLabel}</p>
                  <ShareBar url={url} title={post.title} />
                </div>

                <AuthorBox name={post.author_name} />

                <div className="mt-12 rounded-2xl bg-gradient-primary p-8 sm:p-10 text-primary-foreground">
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-3">{cfg.ctaTitle}</h2>
                  <p className="text-base opacity-90 mb-6 max-w-md">{cfg.ctaBody}</p>
                  <Link
                    to="/"
                    hash="planos"
                    className="inline-flex px-6 py-3 rounded-xl bg-background text-foreground font-bold text-sm hover:bg-background/90 transition"
                  >
                    {cfg.ctaCta}
                  </Link>
                </div>
              </div>
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-6">
                <TableOfContents source={post.content_md} />
              </div>
            </aside>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
