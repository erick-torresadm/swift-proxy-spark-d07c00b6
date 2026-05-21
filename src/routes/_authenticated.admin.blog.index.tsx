import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, Eye, FileText } from "lucide-react";
import { listAllPostsAdmin } from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/")({
  component: PostsListPage,
});

function PostsListPage() {
  const fn = useServerFn(listAllPostsAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: () => fn(),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {data?.length ?? 0} posts
        </h3>
        <Link
          to="/admin/blog/new"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> Novo post
        </Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && (data ?? []).length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Nenhum post ainda.</p>
          <Link
            to="/admin/blog/new"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> Criar o primeiro
          </Link>
        </div>
      )}

      {(data ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Título</th>
                <th className="px-4 py-3 font-bold">Categoria</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Publicado</th>
                <th className="px-4 py-3 font-bold text-right">Views</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <Link
                      to="/admin/blog/$id"
                      params={{ id: p.id }}
                      className="font-semibold hover:text-primary"
                    >
                      {p.title}
                    </Link>
                    <div className="text-[11px] text-muted-foreground font-mono">/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.status === "published"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : p.status === "archived"
                            ? "bg-muted text-muted-foreground"
                            : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {p.published_at
                      ? new Date(p.published_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.view_count ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "published" && (
                      <Link
                        to="/blog/$slug"
                        params={{ slug: p.slug }}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="w-3.5 h-3.5" /> ver
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
