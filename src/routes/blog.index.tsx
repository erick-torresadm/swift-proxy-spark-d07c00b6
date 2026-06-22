import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Clock, Eye, ArrowRight } from "lucide-react";
import { listPublishedPosts, listCategories } from "@/lib/blog.functions";

const SITE = "https://www.fastproxy.com.br";

export const Route = createFileRoute("/blog/")({
  component: BlogIndex,
  head: () => ({
    meta: [
      { title: "Blog FastProxy — Guias, comparativos e tutoriais sobre proxies" },
      {
        name: "description",
        content:
          "Aprenda sobre proxies IPv6, IPv4, ISP e residenciais. Guias práticos para scraping, automação, anti-bloqueio e mais. Atualizado semanalmente.",
      },
      { property: "og:title", content: "Blog FastProxy — Guias e tutoriais sobre proxies" },
      {
        property: "og:description",
        content: "Conteúdo técnico sobre proxies, scraping, automação e anonimato.",
      },
      { property: "og:url", content: `${SITE}/blog` },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "FastProxy" },
    ],
    links: [{ rel: "canonical", href: `${SITE}/blog` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Blog FastProxy",
          url: `${SITE}/blog`,
          inLanguage: "pt-BR",
          publisher: { "@type": "Organization", name: "FastProxy" },
        }),
      },
    ],
  }),
});

function BlogIndex() {
  const fetchPosts = useServerFn(listPublishedPosts);
  const fetchCats = useServerFn(listCategories);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["blog-posts", search, page],
    queryFn: () => fetchPosts({ data: { page, pageSize: 12, search: search || undefined } }),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: () => fetchCats(),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 12));
  const posts = data?.posts ?? [];
  const featured = page === 1 && !search ? posts[0] : null;
  const rest = featured ? posts.slice(1) : posts;

  return (
    <div>
      {/* HERO */}
      <header className="mb-12">
        <p className="text-xs uppercase tracking-widest text-primary font-black mb-4">
          Blog FastProxy
        </p>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5 max-w-3xl">
          Conteúdo que ajuda você a usar proxies do jeito certo
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          Guias, comparativos, tutoriais de scraping e dicas de anti-detecção —
          sem enrolação.
        </p>
      </header>

      {/* SEARCH + CATEGORIES */}
      <div className="flex flex-wrap gap-3 mb-10 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar artigos…"
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-card text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to="/blog/c/$slug"
              params={{ slug: c.slug }}
              className="px-3 py-1.5 rounded-full bg-card border border-border text-xs font-semibold hover:border-primary hover:text-primary transition"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : posts.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nenhum artigo encontrado.
        </div>
      ) : (
        <>
          {/* FEATURED */}
          {featured && (
            <Link
              to="/blog/$slug"
              params={{ slug: featured.slug }}
              className="group grid md:grid-cols-2 gap-6 lg:gap-10 bg-card border border-border rounded-3xl overflow-hidden hover:border-primary/60 transition mb-12"
            >
              {featured.cover_image_url && (
                <div className="aspect-[16/10] md:aspect-auto overflow-hidden bg-background">
                  <img
                    src={featured.cover_image_url}
                    alt={featured.title}
                    loading="eager"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                  />
                </div>
              )}
              <div className="p-6 md:p-10 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] uppercase tracking-widest text-primary font-black px-2.5 py-1 rounded-full bg-primary/10">
                    Em destaque
                  </span>
                  {featured.category && (
                    <span className="text-xs text-muted-foreground font-semibold">
                      {featured.category.name}
                    </span>
                  )}
                </div>
                <h2 className="font-black text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight mb-4 group-hover:text-primary transition">
                  {featured.title}
                </h2>
                {featured.excerpt && (
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    {featured.excerpt}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {featured.reading_time_minutes} min
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary font-bold ml-auto">
                    Ler artigo <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* GRID */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((p) => (
              <Link
                key={p.id}
                to="/blog/$slug"
                params={{ slug: p.slug }}
                className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/60 transition flex flex-col"
              >
                {p.cover_image_url && (
                  <div className="aspect-[16/9] overflow-hidden bg-background">
                    <img
                      src={p.cover_image_url}
                      alt={p.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  </div>
                )}
                <div className="p-6 flex flex-col flex-1">
                  {p.category && (
                    <span className="text-[10px] uppercase tracking-widest text-primary font-black mb-3">
                      {p.category.name}
                    </span>
                  )}
                  <h2 className="font-black text-lg leading-snug tracking-tight mb-3 group-hover:text-primary transition">
                    {p.title}
                  </h2>
                  {p.excerpt && (
                    <p className="text-sm text-muted-foreground mb-5 line-clamp-3 flex-1 leading-relaxed">
                      {p.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-3 border-t border-border">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {p.reading_time_minutes} min
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {p.view_count}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-12">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-30 hover:border-primary transition"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-30 hover:border-primary transition"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
