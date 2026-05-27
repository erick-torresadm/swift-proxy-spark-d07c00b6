import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { listPublishedPosts, listCategories } from "@/lib/blog.functions";

const SITE = "https://www.fastproxy.com.br";

export const Route = createFileRoute("/blog/c/$slug")({
  loader: async ({ params }) => {
    const cats = await listCategories();
    const cat = cats.find((c) => c.slug === params.slug) ?? null;
    return { category: cat };
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.category?.name ?? params.slug;
    const url = `${SITE}/blog/c/${params.slug}`;
    return {
      meta: [
        { title: `${name} — Blog FastProxy` },
        {
          name: "description",
          content:
            loaderData?.category?.description ??
            `Artigos sobre ${name} no blog da FastProxy.`,
        },
        { property: "og:title", content: `${name} — Blog FastProxy` },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { category } = Route.useLoaderData();
  const fetchPosts = useServerFn(listPublishedPosts);
  const { data, isLoading } = useQuery({
    queryKey: ["blog-cat", slug],
    queryFn: () => fetchPosts({ data: { categorySlug: slug, pageSize: 50 } }),
  });

  return (
    <div>
      <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">
        {category?.name ?? slug}
      </h1>
      {category?.description && (
        <p className="text-lg text-muted-foreground mb-8">{category.description}</p>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
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
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-5 flex-1">
                <h2 className="font-black text-lg leading-tight mb-2 group-hover:text-primary transition">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{p.excerpt}</p>
                )}
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" /> {p.reading_time_minutes} min
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
