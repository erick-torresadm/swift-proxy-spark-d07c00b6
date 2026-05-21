import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, FileText, Search, Copy, Archive, Send, Trash2, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import {
  listAllPostsAdmin,
  listCategories,
  bulkUpdatePosts,
  duplicatePost,
} from "@/lib/blog.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/blog/")({
  component: PostsListPage,
});

type StatusFilter = "all" | "draft" | "published" | "archived";

function PostsListPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listAllPostsAdmin);
  const catFn = useServerFn(listCategories);
  const bulkFn = useServerFn(bulkUpdatePosts);
  const dupFn = useServerFn(duplicatePost);

  const { data, isLoading } = useQuery({ queryKey: ["admin-posts"], queryFn: () => fn() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => catFn() });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.slug.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, search, statusFilter, categoryFilter]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  }

  async function runBulk(action: "publish" | "draft" | "archive" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete" && !confirm(`Excluir ${selected.size} post(s) DEFINITIVAMENTE?`)) return;
    try {
      const res = await bulkFn({ data: { ids: Array.from(selected), action } });
      toast.success(`${res.count} post(s) atualizados`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function duplicate(id: string) {
    try {
      const res = await dupFn({ data: { id } });
      toast.success("Duplicado!");
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
      window.location.href = `/admin/blog/${res.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {filtered.length} de {data?.length ?? 0} posts
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Score SEO médio:{" "}
            <span className="font-bold text-foreground">
              {data && data.length
                ? Math.round(data.reduce((s, p) => s + p.seo_score, 0) / data.length)
                : 0}
              %
            </span>
          </p>
        </div>
        <Link
          to="/admin/blog/new"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> Novo post
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou slug..."
            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">Todos status</option>
          <option value="published">Publicados</option>
          <option value="draft">Rascunhos</option>
          <option value="archived">Arquivados</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">Todas categorias</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-primary">{selected.size} selecionado(s)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => runBulk("publish")} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold inline-flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Publicar
            </button>
            <button onClick={() => runBulk("draft")} className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-bold inline-flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5" /> Rascunho
            </button>
            <button onClick={() => runBulk("archive")} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold inline-flex items-center gap-1.5">
              <Archive className="w-3.5 h-3.5" /> Arquivar
            </button>
            <button onClick={() => runBulk("delete")} className="px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-bold inline-flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            {(data?.length ?? 0) === 0 ? "Nenhum post ainda." : "Nenhum post corresponde aos filtros."}
          </p>
          <Link
            to="/admin/blog/new"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> Criar
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="px-3 py-3 font-bold">Título</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">SEO</th>
                <th className="px-3 py-3 font-bold text-right">Palavras</th>
                <th className="px-3 py-3 font-bold text-right">Views</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="px-3 py-3 max-w-[300px]">
                    <Link
                      to="/admin/blog/$id"
                      params={{ id: p.id }}
                      className="font-semibold hover:text-primary block truncate"
                    >
                      {p.title}
                      {p.noindex && (
                        <span className="ml-2 text-[9px] uppercase font-bold text-amber-400">noindex</span>
                      )}
                    </Link>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">/{p.slug}</div>
                    {p.category_name && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{p.category_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
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
                    {p.published_at && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(p.published_at).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`text-xs font-bold tabular-nums ${
                          p.seo_score >= 80 ? "text-emerald-400" : p.seo_score >= 50 ? "text-amber-400" : "text-destructive"
                        }`}
                      >
                        {p.seo_score}%
                      </div>
                      <div className="flex gap-0.5" title="meta_title • meta_desc • capa • keyword • faq • tamanho">
                        {Object.entries(p.seo_checks).map(([k, ok]) => (
                          <span key={k}>
                            {ok ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-muted-foreground/40" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs text-muted-foreground">
                    {p.word_count}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.view_count ?? 0}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => duplicate(p.id)}
                        title="Duplicar"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {p.status === "published" && (
                        <Link
                          to="/blog/$slug"
                          params={{ slug: p.slug }}
                          target="_blank"
                          title="Ver no blog"
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
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
