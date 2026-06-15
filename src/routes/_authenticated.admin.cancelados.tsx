import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, UserX, Mail, MessageCircle, Tag, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { listCanceled, sendWinbackEmail } from "@/lib/admin-kpis.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/cancelados")({
  component: CanceladosPage,
  head: () => ({ meta: [{ title: "Cancelados — Admin" }] }),
});

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function normalizeBrPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function CanceladosPage() {
  const fetchFn = useServerFn(listCanceled);
  const sendFn = useServerFn(sendWinbackEmail);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-canceled"],
    queryFn: () => fetchFn(),
    refetchInterval: 5 * 60_000,
  });

  const send = useMutation({
    mutationFn: (vars: {
      email: string;
      name: string | null;
      productName: string | null;
      couponCode?: string;
    }) => sendFn({ data: vars }),
    onMutate: (v) => setBusy(v.email),
    onSettled: () => setBusy(null),
    onSuccess: (r) => toast.success(`Email enviado para ${r.sent_to}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const totalMrrLost = rows.reduce((s, r) => s + (r.interval === "month" ? r.amount_cents : 0), 0);

  return (
    <div className="space-y-6">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Visão geral
      </Link>

      <div>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <UserX className="w-5 h-5 text-muted-foreground" />
          Clientes cancelados
        </h2>
        <p className="text-sm text-muted-foreground">
          Últimas {rows.length} assinaturas canceladas no Stripe. MRR mensal perdido aproximado:{" "}
          <strong className="text-foreground">{fmtBRL(totalMrrLost)}</strong>.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1 mb-1">
            <Tag className="w-3 h-3" /> Cupom de winback (opcional)
          </label>
          <input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder="Ex.: VOLTA20"
            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground max-w-md">
          Se preencher, o cupom é incluído no email enviado. Crie o cupom em{" "}
          <Link to="/admin/cupons" className="text-primary hover:underline">
            Admin → Cupons
          </Link>{" "}
          antes.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando do Stripe…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Nenhuma assinatura cancelada encontrada.
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold">Plano</th>
                <th className="px-4 py-3 font-bold">Motivo</th>
                <th className="px-4 py-3 font-bold text-right">Cancelou há</th>
                <th className="px-4 py-3 font-bold text-right">Valor</th>
                <th className="px-4 py-3 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wa = normalizeBrPhone(r.phone);
                const waMsg = `Oi ${r.name?.split(" ")[0] ?? "tudo bem"}! Aqui é da FastProxy. Vimos que você cancelou sua assinatura${
                  r.product_name ? ` do ${r.product_name}` : ""
                }. Posso te ajudar a voltar com uma condição especial?`;
                const waUrl = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(waMsg)}` : null;
                return (
                  <tr key={r.subscription_id} className="border-t border-border hover:bg-muted/30 transition align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.name ?? "—"}</div>
                      {r.email && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-0.5"
                          onClick={() => {
                            navigator.clipboard.writeText(r.email!);
                            toast.success("Email copiado");
                          }}
                        >
                          {r.email} <Copy className="w-3 h-3 opacity-50" />
                        </button>
                      )}
                      {r.phone && (
                        <div className="text-[11px] text-muted-foreground">{r.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.product_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.cancel_reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{r.days_since_cancel}d</td>
                    <td className="px-4 py-3 text-right">
                      {fmtBRL(r.amount_cents)}
                      <div className="text-[10px] text-muted-foreground">/{r.interval ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {waUrl && (
                          <a
                            href={waUrl}
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
                          disabled={!r.email || (send.isPending && busy === r.email)}
                          onClick={() =>
                            r.email &&
                            send.mutate({
                              email: r.email,
                              name: r.name,
                              productName: r.product_name,
                              couponCode: coupon || undefined,
                            })
                          }
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {send.isPending && busy === r.email ? "Enviando…" : "Winback"}
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

      <div className="bg-card border border-border rounded-2xl p-5 text-sm text-muted-foreground">
        <p className="font-bold text-foreground mb-2">💡 Dicas para resgatar cancelados</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-foreground">Crie um cupom específico</strong> (ex.{" "}
            <code>VOLTA20</code> = 20% por 3 meses) em{" "}
            <Link to="/admin/cupons" className="text-primary hover:underline">
              Cupons
            </Link>{" "}
            e use-o no campo acima antes de enviar os emails.
          </li>
          <li>
            <strong className="text-foreground">Priorize cancelamentos recentes</strong> (≤30 dias) — taxa de
            retorno é muito maior.
          </li>
          <li>
            <strong className="text-foreground">WhatsApp converte mais</strong>: comece pelos que têm telefone.
            Ofereça desconto + pergunte o motivo do cancelamento.
          </li>
          <li>
            Cancelamentos com <code>cancellation_reason = customer_service</code> ou{" "}
            <code>too_expensive</code> normalmente voltam com desconto. Quem cancelou por{" "}
            <code>switched_service</code> dificilmente retorna.
          </li>
        </ul>
      </div>
    </div>
  );
}
