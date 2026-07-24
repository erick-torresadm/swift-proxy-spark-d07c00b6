import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, Power } from "lucide-react";
import {
  listAdminPackages,
  upsertPackage,
  deletePackage,
  togglePackageActive,
  listVpsProductOptions,
  type AdminPackageRow,
} from "@/lib/packages.functions";

export const Route = createFileRoute("/_authenticated/admin/pacotes")({
  component: PackagesAdmin,
});

type Draft = {
  id?: string;
  product_id: string;
  quantity: number;
  term_months: number;
  price_cents: number | null;
  label: string;
  description: string;
  active: boolean;
  sort_order: number;
};

function emptyDraft(product_id = ""): Draft {
  return {
    product_id,
    quantity: 5,
    term_months: 3,
    price_cents: null,
    label: "",
    description: "",
    active: true,
    sort_order: 100,
  };
}

function PackagesAdmin() {
  const listFn = useServerFn(listAdminPackages);
  const productsFn = useServerFn(listVpsProductOptions);
  const upsertFn = useServerFn(upsertPackage);
  const deleteFn = useServerFn(deletePackage);
  const toggleFn = useServerFn(togglePackageActive);
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: () => listFn(),
  });
  const { data: products } = useQuery({
    queryKey: ["admin-package-products"],
    queryFn: () => productsFn(),
  });

  const [editing, setEditing] = useState<Draft | null>(null);

  const byProduct = useMemo(() => {
    const m = new Map<string, AdminPackageRow[]>();
    for (const r of rows ?? []) {
      const k = `${r.product_slug} · ${r.product_name}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      upsertFn({
        data: {
          id: d.id,
          product_id: d.product_id,
          quantity: d.quantity,
          term_months: d.term_months,
          price_cents: d.price_cents,
          label: d.label.trim() || null,
          description: d.description.trim() || null,
          active: d.active,
          sort_order: d.sort_order,
        },
      }),
    onSuccess: () => {
      toast.success("Pacote salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Pacote removido");
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-packages"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold mb-1">Pacotes prépagos</h2>
          <p className="text-sm text-muted-foreground">
            Cobrança única (mode=payment). Preço configurado aqui = preço final que o
            cliente paga. Ative/desative sem apagar para preservar histórico.
          </p>
        </div>
        <button
          onClick={() => setEditing(emptyDraft(products?.[0]?.id))}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Novo pacote
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="space-y-6">
        {byProduct.map(([label, packs]) => (
          <div key={label} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-bold">{label}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2">Qtd</th>
                    <th className="p-2">Meses</th>
                    <th className="p-2">Preço</th>
                    <th className="p-2">R$/IP·mês</th>
                    <th className="p-2">Rótulo</th>
                    <th className="p-2">Ordem</th>
                    <th className="p-2">Ativo</th>
                    <th className="p-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-2 font-bold">{p.quantity}</td>
                      <td className="p-2">{p.term_months}</td>
                      <td className="p-2">
                        {p.price_cents == null ? (
                          <span className="text-amber-500">Sem preço</span>
                        ) : (
                          formatBRL(p.price_cents)
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {p.price_cents == null
                          ? "—"
                          : formatBRL(p.price_cents / p.quantity / p.term_months)}
                      </td>
                      <td className="p-2">{p.label ?? "—"}</td>
                      <td className="p-2">{p.sort_order}</td>
                      <td className="p-2">
                        <button
                          onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                            p.active
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {p.active ? "Ativo" : "Inativo"}
                        </button>
                      </td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() =>
                              setEditing({
                                id: p.id,
                                product_id: p.product_id,
                                quantity: p.quantity,
                                term_months: p.term_months,
                                price_cents: p.price_cents,
                                label: p.label ?? "",
                                description: p.description ?? "",
                                active: p.active,
                                sort_order: p.sort_order,
                              })
                            }
                            className="px-2 py-1 rounded border border-border text-xs hover:bg-accent"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Remover este pacote?")) del.mutate(p.id);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs text-red-600 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!isLoading && (rows ?? []).length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
            Nenhum pacote cadastrado ainda.
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          draft={editing}
          products={products ?? []}
          onCancel={() => setEditing(null)}
          onSave={(d) => save.mutate(d)}
          saving={save.isPending}
        />
      )}
    </div>
  );
}

function EditModal({
  draft,
  products,
  onCancel,
  onSave,
  saving,
}: {
  draft: Draft;
  products: Array<{ id: string; slug: string | null; name: string | null; category: string | null; country_code: string | null }>;
  onCancel: () => void;
  onSave: (d: Draft) => void;
  saving: boolean;
}) {
  const [d, setD] = useState<Draft>(draft);
  const priceInput =
    d.price_cents == null ? "" : (d.price_cents / 100).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{d.id ? "Editar pacote" : "Novo pacote"}</h3>
          <button onClick={onCancel} className="text-sm text-muted-foreground hover:underline">
            Cancelar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm md:col-span-2">
            <span className="text-xs text-muted-foreground">Produto</span>
            <select
              value={d.product_id}
              onChange={(e) => setD({ ...d, product_id: e.target.value })}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2"
            >
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.slug ?? p.id.slice(0, 8)}
                  {p.country_code ? ` (${p.country_code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted-foreground">Quantidade de IPs</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={d.quantity}
              onChange={(e) =>
                setD({ ...d, quantity: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-full mt-1 rounded-md border bg-background px-2 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted-foreground">Prazo (meses)</span>
            <input
              type="number"
              min={1}
              max={60}
              value={d.term_months}
              onChange={(e) =>
                setD({ ...d, term_months: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-full mt-1 rounded-md border bg-background px-2 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted-foreground">Preço (R$)</span>
            <input
              type="number"
              step="0.01"
              min={0}
              placeholder="Ex: 129.00"
              value={priceInput}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") return setD({ ...d, price_cents: null });
                const n = Number(v);
                setD({
                  ...d,
                  price_cents: isNaN(n) ? null : Math.round(n * 100),
                });
              }}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted-foreground">Ordem de exibição</span>
            <input
              type="number"
              min={0}
              max={9999}
              value={d.sort_order}
              onChange={(e) =>
                setD({ ...d, sort_order: Math.max(0, Number(e.target.value) || 0) })
              }
              className="w-full mt-1 rounded-md border bg-background px-2 py-2"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-xs text-muted-foreground">Rótulo (opcional)</span>
            <input
              type="text"
              maxLength={120}
              value={d.label}
              onChange={(e) => setD({ ...d, label: e.target.value })}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2"
              placeholder="Ex: Pack 10 · 3 meses"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-xs text-muted-foreground">Descrição (opcional)</span>
            <textarea
              maxLength={500}
              value={d.description}
              onChange={(e) => setD({ ...d, description: e.target.value })}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 min-h-[80px]"
            />
          </label>
          <label className="text-sm inline-flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={d.active}
              onChange={(e) => setD({ ...d, active: e.target.checked })}
            />
            <span>Ativo (aparece na página pública quando tiver preço)</span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-md border border-border text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(d)}
            disabled={saving || !d.product_id}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
