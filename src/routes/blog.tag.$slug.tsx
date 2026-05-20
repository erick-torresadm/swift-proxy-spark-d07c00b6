import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPublishedPosts } from "@/lib/blog.functions";

const SITE = "https://swift-proxy-spark.lovable.app";

export const Route = createFileRoute("/blog/tag/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `#${params.slug} — Blog FastProxy` },
      { name: "description", content: `Artigos marcados como ${params.slug}.` },
      { property: "og:url", content: `${SITE}/blog/tag/${params.slug}` },
    ],
    links: [{ rel: "canonical", href: `${SITE}/blog/tag/${params.slug}` }],
  }),
  component: TagPage,
});

function TagPage() {
  const { slug } = Route.useParams();
  const fetchPosts = useServerFn(listPublishedPosts);
  const { data, isLoading } = useQuery({
    queryKey: ["blog-tag", slug],
    queryFn: () => fetchPosts({ data: { tagSlug: slug, pageSize: 50 } }),
  });
  return (
    <div>
      <h1 className="text-4xl font-black tracking-tight mb-8">#{slug}</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.posts.map((p) => (
            <Link
              key={p.id}
              to="/blog/$slug"
              params={{ slug: p.slug }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/60 transition"
            >
              <h2 className="font-black text-lg mb-2">{p.title}</h2>
              {p.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-2">{p.excerpt}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
