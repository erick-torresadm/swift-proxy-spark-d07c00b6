import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listTranslatedPublishedPosts } from "@/lib/blog.functions";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

const SITE = "https://www.fastproxy.com.br";
const ALLOWED = new Set(["en", "es", "de", "fr", "it", "nl", "ja"]);

const TITLES: Record<string, { title: string; desc: string; htmlLang: string; ogLocale: string }> = {
  en: { title: "FastProxy Blog — Proxies, Facebook Ads & automation", desc: "Guides, comparisons and tutorials about dedicated proxies for media buyers, scrapers and automation.", htmlLang: "en", ogLocale: "en_US" },
  es: { title: "Blog FastProxy — Proxies, Facebook Ads y automatización", desc: "Guías, comparativas y tutoriales sobre proxies dedicados.", htmlLang: "es", ogLocale: "es_ES" },
  de: { title: "FastProxy Blog — Proxies, Facebook Ads & Automatisierung", desc: "Anleitungen, Vergleiche und Tutorials zu dedizierten Proxys.", htmlLang: "de", ogLocale: "de_DE" },
  fr: { title: "Blog FastProxy — Proxies, Facebook Ads & automatisation", desc: "Guides, comparatifs et tutoriels sur les proxies dédiés.", htmlLang: "fr", ogLocale: "fr_FR" },
  it: { title: "Blog FastProxy — Proxy, Facebook Ads e automazione", desc: "Guide, confronti e tutorial sui proxy dedicati.", htmlLang: "it", ogLocale: "it_IT" },
  nl: { title: "FastProxy Blog — Proxies, Facebook Ads & automatisering", desc: "Gidsen, vergelijkingen en tutorials over dedicated proxies.", htmlLang: "nl", ogLocale: "nl_NL" },
  ja: { title: "FastProxy ブログ — プロキシ・Facebook広告・自動化", desc: "専用プロキシに関するガイド、比較、チュートリアル。", htmlLang: "ja", ogLocale: "ja_JP" },
};

export const Route = createFileRoute("/$locale/blog/")({
  loader: ({ params }) => {
    if (!ALLOWED.has(params.locale)) throw notFound();
    return { locale: params.locale };
  },
  head: ({ params }) => {
    const cfg = TITLES[params.locale] ?? TITLES.en;
    const url = `${SITE}/${params.locale}/blog`;
    return {
      meta: [
        { title: cfg.title },
        { name: "description", content: cfg.desc },
        { property: "og:title", content: cfg.title },
        { property: "og:description", content: cfg.desc },
        { property: "og:url", content: url },
        { property: "og:locale", content: cfg.ogLocale },
        { property: "og:type", content: "website" },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "x-default", href: `${SITE}/blog` },
        { rel: "alternate", hrefLang: "pt-BR", href: `${SITE}/blog` },
        ...Object.keys(TITLES).map((l) => ({
          rel: "alternate",
          hrefLang: l,
          href: `${SITE}/${l}/blog`,
        })),
      ],
    };
  },
  component: TranslatedIndex,
});

function TranslatedIndex() {
  const { locale } = Route.useLoaderData();
  const fetchPosts = useServerFn(listTranslatedPublishedPosts);
  const { data, isLoading } = useQuery({
    queryKey: ["blog-i18n", locale],
    queryFn: () =>
      fetchPosts({ data: { locale: locale as "en", page: 1, pageSize: 24 } }),
  });
  const cfg = TITLES[locale] ?? TITLES.en;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 sm:pt-32 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">{cfg.title}</h1>
          <p className="text-muted-foreground mb-10">{cfg.desc}</p>

          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !data || data.posts.length === 0 ? (
            <p className="text-muted-foreground">No posts in this language yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.posts.map((p) => (
                <Link
                  key={p.slug}
                  to="/$locale/blog/$slug"
                  params={{ locale, slug: p.slug }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/60 transition group"
                >
                  {p.cover_image_url && (
                    <img
                      src={p.cover_image_url}
                      alt={p.title}
                      className="w-full aspect-[16/9] object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="p-5">
                    <h2 className="font-black text-lg mb-2 line-clamp-2">{p.title}</h2>
                    {p.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{p.excerpt}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
