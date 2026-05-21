import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save } from "lucide-react";
import {
  listCategories,
  upsertCategory,
  deleteCategory,
} from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/categorias")({
  component: CategoriesPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CategoriesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCategories);
  const upsertFn = useServerFn(upsertCategory);
  const delFn = useServerFn(deleteCategory);
  const { data } = useQuery({ queryKey: ["categories"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await upsertFn({ data: { name, slug: slug || slugify(name) } });
      setName("");
      setSlug("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta categoria?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["categories"] });
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-4 py-3 font-bold">Nome</th>
              <th className="px-4 py-3 font-bold">Slug</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.slug}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(c.id)}
                    className="text-destructive hover:bg-destructive/10 p-1.5 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma categoria
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-3 h-fit">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova categoria
        </h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
          maxLength={80}
        />
        <input
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          placeholder="slug (auto)"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={create}
          disabled={busy || !name}
          className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Criar
        </button>
      </div>
    </div>
  );
}
