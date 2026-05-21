import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save } from "lucide-react";
import { listTags, upsertTag, deleteTag } from "@/lib/blog.functions";

export const Route = createFileRoute("/_authenticated/admin/blog/tags")({
  component: TagsPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function TagsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTags);
  const upsertFn = useServerFn(upsertTag);
  const delFn = useServerFn(deleteTag);
  const { data } = useQuery({ queryKey: ["tags"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await upsertFn({ data: { name, slug: slug || slugify(name) } });
      setName("");
      setSlug("");
      qc.invalidateQueries({ queryKey: ["tags"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-wrap gap-2">
          {(data ?? []).map((t) => (
            <div
              key={t.id}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-foreground/5 border border-border text-xs"
            >
              <span className="font-semibold">{t.name}</span>
              <span className="font-mono text-muted-foreground">{t.slug}</span>
              <button
                onClick={async () => {
                  if (!confirm("Excluir tag?")) return;
                  await delFn({ data: { id: t.id } });
                  qc.invalidateQueries({ queryKey: ["tags"] });
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {(data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma tag</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-3 h-fit">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova tag
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
