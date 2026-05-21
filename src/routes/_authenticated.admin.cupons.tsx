import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Tag, Plus, Trash2, Pencil, Power, Copy, History, X } from "lucide-react";
import {
  listCoupons,
  upsertCoupon,
  deleteCoupon,
  listCouponRedemptions,
} from "@/lib/coupons.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/cupons")({
  component: CouponsPage,
});

type Coupon = Awaited<ReturnType<typeof listCoupons>>[number];

const fmtBrl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CouponsPage() {
  const fn = useServerFn(listCoupons);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => fn(),
  });

  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" /> Cupons de desconto
          </h2>
          <p className="text-sm text-muted-foreground">
            Crie códigos de desconto em % ou R$. Aplicados no checkout via Stripe.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> Novo cupom
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Código</th>
                <th className="text-left p-3">Desconto</th>
                <th className="text-left p-3">Pedido mín.</th>
                <th className="text-left p-3">Usos</th>
                <th className="text-left p-3">Validade</th>
                <th className="text-left p-3">Ciclo</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Nenhum cupom criado ainda.
                  </td>
                </tr>
              )}
              {(data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-primary">{c.code}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(c.code);
                          toast.success("Código copiado");
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copiar"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    {c.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{c.description}</p>
                    )}
                  </td>
                  <td className="p-3 font-semibold">
                    {c.kind === "percent" ? `${c.value_pct}%` : fmtBrl(c.value_cents ?? 0)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {c.min_amount_cents > 0 ? fmtBrl(c.min_amount_cents) : "—"}
                  </td>
                  <td className="p-3">
                    {c.uses_count}
                    {c.max_uses ? ` / ${c.max_uses}` : ""}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {c.valid_until
                      ? new Date(c.valid_until).toLocaleDateString("pt-BR")
                      : "Sem expiração"}
                  </td>
                  <td className="p-3 text-muted-foreground capitalize">{c.applies_to_billing}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.active
                          ? "bg-green-500/15 text-green-500"
                          : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {c.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setHistoryId(c.id)}
                        className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground"
                        title="Histórico"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setCreating(false);
                          setEditing(c);
                        }}
                        className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <ToggleActive coupon={c} onDone={() => refetch()} />
                      <DeleteBtn coupon={c} onDone={() => refetch()} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(editing || creating) && (
        <CouponDialog
          coupon={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            refetch();
          }}
        />
      )}

      {historyId && (
        <RedemptionsDialog couponId={historyId} onClose={() => setHistoryId(null)} />
      )}
    </div>
  );
}

function ToggleActive({ coupon, onDone }: { coupon: Coupon; onDone: () => void }) {
  const save = useServerFn(upsertCoupon);
  const m = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(coupon.active ? "Cupom desativado" : "Cupom ativado");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      onClick={() =>
        m.mutate({
          data: {
            id: coupon.id,
            code: coupon.code,
            description: coupon.description,
            kind: coupon.kind,
            value_pct: coupon.value_pct,
            value_cents: coupon.value_cents,
            min_amount_cents: coupon.min_amount_cents,
            max_uses: coupon.max_uses,
            active: !coupon.active,
            valid_until: coupon.valid_until,
            applies_to_billing: coupon.applies_to_billing as "any" | "monthly" | "yearly",
          },
        })
      }
      disabled={m.isPending}
      className={`p-1.5 rounded hover:bg-muted/40 ${
        coupon.active ? "text-green-500" : "text-muted-foreground"
      }`}
      title={coupon.active ? "Desativar" : "Ativar"}
    >
      <Power className="w-3.5 h-3.5" />
    </button>
  );
}

function DeleteBtn({ coupon, onDone }: { coupon: Coupon; onDone: () => void }) {
  const del = useServerFn(deleteCoupon);
  const m = useMutation({
    mutationFn: del,
    onSuccess: () => {
      toast.success("Cupom excluído");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      onClick={() => {
        if (confirm(`Excluir cupom ${coupon.code}? Esta ação é permanente.`)) {
          m.mutate({ data: { id: coupon.id } });
        }
      }}
      disabled={m.isPending}
      className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
      title="Excluir"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function CouponDialog({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(upsertCoupon);
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    description: coupon?.description ?? "",
    kind: (coupon?.kind ?? "percent") as "percent" | "fixed",
    value_pct: coupon?.value_pct ?? 10,
    value_brl: coupon?.value_cents ? (coupon.value_cents / 100).toFixed(2) : "10.00",
    min_brl: coupon?.min_amount_cents ? (coupon.min_amount_cents / 100).toFixed(2) : "0",
    max_uses: coupon?.max_uses ?? "",
    valid_until: coupon?.valid_until ? coupon.valid_until.slice(0, 10) : "",
    applies_to_billing: (coupon?.applies_to_billing ?? "any") as "any" | "monthly" | "yearly",
    active: coupon?.active ?? true,
  });

  const m = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(coupon ? "Cupom atualizado" : "Cupom criado");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    m.mutate({
      data: {
        id: coupon?.id,
        code: form.code.trim().toUpperCase(),
        description: form.description || null,
        kind: form.kind,
        value_pct: form.kind === "percent" ? Number(form.value_pct) : null,
        value_cents: form.kind === "fixed" ? Math.round(Number(form.value_brl) * 100) : null,
        min_amount_cents: Math.round(Number(form.min_brl || "0") * 100),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
        applies_to_billing: form.applies_to_billing,
        active: form.active,
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{coupon ? "Editar cupom" : "Novo cupom"}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">Código</span>
            <input
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="BLACKFRIDAY"
              maxLength={40}
              pattern="[A-Za-z0-9_-]+"
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm font-mono uppercase"
            />
          </label>
          <label className="block col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">Descrição (opcional)</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={200}
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Tipo</span>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "fixed" })}
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="percent">Porcentagem (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              {form.kind === "percent" ? "Desconto (%)" : "Desconto (R$)"}
            </span>
            {form.kind === "percent" ? (
              <input
                type="number"
                min={0.01}
                max={100}
                step="0.01"
                value={form.value_pct}
                onChange={(e) => setForm({ ...form, value_pct: Number(e.target.value) })}
                className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
              />
            ) : (
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={form.value_brl}
                onChange={(e) => setForm({ ...form, value_brl: e.target.value })}
                className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
              />
            )}
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Pedido mínimo (R$)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.min_brl}
              onChange={(e) => setForm({ ...form, min_brl: e.target.value })}
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">
              Usos máximos (vazio = ilimitado)
            </span>
            <input
              type="number"
              min={1}
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Válido até</span>
            <input
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Ciclo aplicável</span>
            <select
              value={form.applies_to_billing}
              onChange={(e) =>
                setForm({
                  ...form,
                  applies_to_billing: e.target.value as "any" | "monthly" | "yearly",
                })
              }
              className="mt-1 w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="any">Mensal e anual</option>
              <option value="monthly">Apenas mensal</option>
              <option value="yearly">Apenas anual</option>
            </select>
          </label>

          <label className="col-span-2 flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span className="text-sm">Cupom ativo</span>
          </label>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={m.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {m.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RedemptionsDialog({ couponId, onClose }: { couponId: string; onClose: () => void }) {
  const fn = useServerFn(listCouponRedemptions);
  const { data, isLoading } = useQuery({
    queryKey: ["coupon-redemptions", couponId],
    queryFn: () => fn({ data: { coupon_id: couponId } }),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de uso
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum uso registrado.</p>
        )}
        {(data ?? []).length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Quando</th>
                <th className="text-left p-2">Cliente</th>
                <th className="text-right p-2">Pedido</th>
                <th className="text-right p-2">Desconto</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="p-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-2 text-xs">{r.customer_email ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{fmtBrl(r.amount_cents_before)}</td>
                  <td className="p-2 text-right font-bold text-green-500">
                    −{fmtBrl(r.discount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
