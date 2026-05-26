import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Plus, CreditCard, Mail, Phone, ListChecks, X } from "lucide-react";
import { toast } from "sonner";
import {
  getCustomerDetail,
  adminManualAllocate,
  listAvailableStockForOrder,
  adminManualAllocateBulk,
} from "@/lib/admin-ops.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/customers/$userId")({
  component: CustomerDetailPage,
});


function CustomerDetailPage() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const fetchFn = useServerFn(getCustomerDetail);
  const allocFn = useServerFn(adminManualAllocate);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-customer-detail", userId],
    queryFn: () => fetchFn({ data: { userId } }),
  });

  const allocate = useMutation({
    mutationFn: (vars: { orderId: string; syncStripe?: boolean }) =>
      allocFn({ data: vars }),
    onSuccess: (r) => {
      toast.success(`Proxy alocado: ${r.host}:${r.port}`);
      qc.invalidateQueries({ queryKey: ["admin-customer-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-allocations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [pickerOrderId, setPickerOrderId] = useState<string | null>(null);


  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!data) {
    return <p className="text-sm text-destructive">Cliente não encontrado.</p>;
  }

  const { profile, email, orders } = data;

  return (
    <div className="space-y-6">
      <Link
        to="/admin/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-xl font-bold">{profile.full_name ?? "Sem nome"}</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{email ?? "—"}</span>
          {profile.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{profile.phone}</span>}
          <span className="font-mono text-xs">{userId.slice(0, 8)}…</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Pedidos & direito a proxy</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {orders.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nenhum pedido para este cliente.
        </div>
      )}

      <div className="grid gap-3">
        {orders.map((o) => {
          const canAllocate = o.shortage > 0 && o.available_stock > 0;
          const statusColor =
            o.status === "paid" ? "bg-emerald-500/15 text-emerald-500"
            : o.status === "past_due" || o.status === "grace" ? "bg-amber-500/15 text-amber-500"
            : o.status === "cancelled" ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground";
          const stripeColor =
            o.stripe_status === "active" || o.stripe_status === "trialing"
              ? "text-emerald-500"
              : o.stripe_status?.startsWith("error") ? "text-destructive"
              : o.stripe_status ? "text-amber-500" : "text-muted-foreground";

          return (
            <div key={o.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold">{o.product?.name ?? "Produto removido"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {o.product?.category} · {o.product?.country_code ?? "—"} · qty {o.quantity} · {o.billing_cycle}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono">{o.id.slice(0, 8)}…</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor}`}>
                    {o.status}
                  </span>
                  {o.stripe_subscription_id && (
                    <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${stripeColor}`}>
                      <CreditCard className="w-3 h-3" />
                      Stripe: {o.stripe_status ?? "—"}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                <Stat label="Direito a" value={`${o.needed} IP${o.needed > 1 ? "s" : ""}`} />
                <Stat label="Alocados" value={String(o.allocated)} accent={o.allocated >= o.needed ? "ok" : "warn"} />
                <Stat label="Falta" value={String(o.shortage)} accent={o.shortage > 0 ? "warn" : "ok"} />
                <Stat label="Estoque livre" value={String(o.available_stock)} accent={o.available_stock > 0 ? "ok" : "warn"} />
              </div>

              {o.customer_email && o.customer_email !== email && (
                <p className="text-[11px] text-amber-500 mb-2">
                  ⚠ Email no pedido ({o.customer_email}) diferente da conta ({email}).
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!canAllocate || allocate.isPending}
                  onClick={() => allocate.mutate({ orderId: o.id })}
                >
                  <Plus className="w-4 h-4" />
                  Alocar 1 proxy
                </Button>
                {o.stripe_subscription_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={allocate.isPending}
                    onClick={() => allocate.mutate({ orderId: o.id, syncStripe: true })}
                  >
                    <CreditCard className="w-4 h-4" />
                    Sincronizar com Stripe e alocar
                  </Button>
                )}
                {o.shortage === 0 && (
                  <span className="text-xs text-muted-foreground self-center">Pedido completo.</span>
                )}
                {o.shortage > 0 && o.available_stock === 0 && (
                  <span className="text-xs text-destructive self-center">Sem estoque disponível.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "ok" | "warn" }) {
  const c = accent === "ok" ? "text-emerald-500" : accent === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={`text-lg font-black ${c}`}>{value}</div>
    </div>
  );
}
