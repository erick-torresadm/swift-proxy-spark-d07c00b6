import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Eye, Trash2 } from "lucide-react";
import { listAllComments, moderateComment } from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/comentarios")({
  component: ModerationPage,
});

function ModerationPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllComments);
  const modFn = useServerFn(moderateComment);
  const { data } = useQuery({ queryKey: ["all-comments"], queryFn: () => listFn() });

  async function act(id: string, action: "hide" | "show" | "delete") {
    if (action === "delete" && !confirm("Excluir comentário?")) return;
    await modFn({ data: { id, action } });
    qc.invalidateQueries({ queryKey: ["all-comments"] });
  }

  return (
    <div className="space-y-3">
      {(data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      )}
      {(data ?? []).map((c) => {
        const post = (c as { posts?: { slug: string; title: string } | null }).posts;
        return (
          <div
            key={c.id}
            className="bg-card border border-border rounded-xl p-4 flex gap-4 items-start"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    c.status === "visible"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.status}
                </span>
                <span>{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                {post && (
                  <Link to="/blog/$slug" params={{ slug: post.slug }} target="_blank" className="hover:text-foreground">
                    em "{post.title}"
                  </Link>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {c.status === "visible" ? (
                <button
                  onClick={() => act(c.id, "hide")}
                  className="px-2 py-1 rounded text-xs font-semibold bg-foreground/5 hover:bg-foreground/10 inline-flex items-center gap-1"
                >
                  <EyeOff className="w-3 h-3" /> Esconder
                </button>
              ) : (
                <button
                  onClick={() => act(c.id, "show")}
                  className="px-2 py-1 rounded text-xs font-semibold bg-foreground/5 hover:bg-foreground/10 inline-flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" /> Mostrar
                </button>
              )}
              <button
                onClick={() => act(c.id, "delete")}
                className="px-2 py-1 rounded text-xs font-semibold text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Excluir
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
