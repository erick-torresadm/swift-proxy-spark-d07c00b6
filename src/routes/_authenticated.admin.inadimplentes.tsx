import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Mail, MessageCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { listDelinquents, sendDunningEmail } from "@/lib/admin-kpis.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/inadimplentes")({
  component: InadimplentesPage,
  head: () => ({ meta: [{ title: "Inadimplentes — Admin" }] }),
});

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function normalizeBrPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function waLink(phone: string | null, name: string | null, amount: number, days: number) {
  const norm = normalizeBrPhone(phone);
  if (!norm) return null;
  const first = name?.split(" ")[0] ?? "olá";
  const msg = `Oi ${first}! Aqui é da FastProxy. Identificamos um pagamento pendente${
    amount ? ` de ${fmtBRL(amount)}` : ""
  }${days ? ` há ${days} dia(s)` : ""}. Posso te ajudar a regularizar?`;
  return `https://wa.me/${norm}?text=${encodeURIComponent(msg)}`;
}

function InadimplentesPage() {
  const fetchFn = useServerFn(listDelinquents);
  const sendFn = useServerFn(sendDunningEmail);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-delinquents"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (vars: { orderId?: string; userId?: string }) => sendFn({ data: vars }),
    onMutate: (v) => setBusyId(v.orderId ?? v.userId ?? null),
    onSettled: () => setBusyId(null),
    onSuccess: (r) => toast.success(`Email enviado para ${r.sent_to}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Visão geral
      </Link>

      <div>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Inadimplentes
        </h2>
        <p className="text-sm text-muted-foreground">
          Pedidos em <code>past_due</code> ou <code>grace</code>. Total: <strong>{rows.length}</strong>.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          🎉 Nenhum cliente inadimplente no momento.
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold">Contato</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold text-right">Atraso</th>
                <th className="px-4 py-3 font-bold text-right">Valor</th>
                <th className="px-4 py-3 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = r.order_id ?? r.user_id ?? "";
                const wa = waLink(r.phone, r.full_name, r.amount_cents, r.days_overdue);
                return (
                  <tr key={id} className="border-t border-border hover:bg-muted/30 transition align-top">
                    <td className="px-4 py-3">
                      {r.user_id ? (
                        <Link
                          to="/admin/customers/$userId"
                          params={{ userId: r.user_id }}
                          className="font-semibold hover:text-primary"
                        >
                          {r.full_name ?? "—"}
                        </Link>
                      ) : (
                        <span className="font-semibold">{r.full_name ?? "—"}</span>
                      )}
                      <div className="text-[11px] font-mono text-muted-foreground">{id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3 text-xs space-y-1">
                      {r.email ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(r.email!);
                            toast.success("Email copiado");
                          }}
                        >
                          <Mail className="w-3 h-3" /> {r.email} <Copy className="w-3 h-3 opacity-50" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">sem email</span>
                      )}
                      <br />
                      {r.phone ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(r.phone!);
                            toast.success("Telefone copiado");
                          }}
                        >
                          <MessageCircle className="w-3 h-3" /> {r.phone} <Copy className="w-3 h-3 opacity-50" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">sem telefone</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          r.status === "past_due"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-amber-500/15 text-amber-600"
                        }`}
                      >
                        {r.status}
                      </span>
                      <div className="text-[11px] text-muted-foreground mt-1">{r.billing_cycle ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {r.days_overdue}d
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{fmtBRL(r.amount_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!r.email || (send.isPending && busyId === id)}
                          onClick={() =>
                            send.mutate({
                              orderId: r.order_id ?? undefined,
                              userId: r.user_id ?? undefined,
                            })
                          }
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {send.isPending && busyId === id ? "Enviando…" : "Enviar cobrança"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          Atualizar lista
        </Button>
      </div>
    </div>
  );
}
