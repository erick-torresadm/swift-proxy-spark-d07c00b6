import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { listRelatedPosts } from "@/lib/blog.functions";

export function RelatedPosts({ postId }: { postId: string }) {
  const fn = useServerFn(listRelatedPosts);
  const { data } = useQuery({
    queryKey: ["related", postId],
    queryFn: () => fn({ data: { postId, limit: 3 } }),
  });
  if (!data || data.length === 0) return null;
  return (
    <section className="mt-16 pt-10 border-t border-border">
      <h2 className="text-2xl font-black mb-6 tracking-tight">Continue lendo</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {data.map((p) => (
          <Link
            key={p.slug}
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
              <h3 className="font-black text-base leading-snug mb-2 group-hover:text-primary transition">
                {p.title}
              </h3>
              {p.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                  {p.excerpt}
                </p>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary mt-3">
                Ler artigo <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
