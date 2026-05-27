import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Clock, Eye } from "lucide-react";
import { listPublishedPosts, listCategories } from "@/lib/blog.functions";

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
      { property: "og:url", content: "https://www.fastproxy.com.br/blog" },
    ],
    links: [{ rel: "canonical", href: "https://www.fastproxy.com.br/blog" }],
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

  return (
    <div>
      <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
        Conteúdo que ajuda você a usar proxies do jeito certo
      </h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
        Guias, comparativos, tutoriais de scraping e dicas de anti-detecção — sem enrolação.
      </p>

      <div className="flex flex-wrap gap-3 mb-8 items-center">
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
      ) : (data?.posts.length ?? 0) === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nenhum artigo encontrado.
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data?.posts.map((p) => (
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
                <div className="p-5 flex flex-col flex-1">
                  {p.category && (
                    <span className="text-[10px] uppercase tracking-wider text-primary font-bold mb-2">
                      {p.category.name}
                    </span>
                  )}
                  <h2 className="font-black text-lg leading-tight mb-2 group-hover:text-primary transition">
                    {p.title}
                  </h2>
                  {p.excerpt && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3 flex-1">
                      {p.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
            <div className="flex justify-center gap-2 mt-10">
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
