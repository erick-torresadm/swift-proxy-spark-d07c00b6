import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, UserX, Mail, MessageCircle, Tag, ExternalLink, Copy, Send, CheckCircle2, Eye, MousePointerClick, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { listCanceled, sendWinbackEmail } from "@/lib/admin-kpis.functions";
import { getWinbackStatusByEmails, sendWinbackToAll, type EmailStatus } from "@/lib/dunning-status.functions";
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

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d >= 1) return `há ${d}d`;
  const h = Math.floor(diff / 3_600_000);
  if (h >= 1) return `há ${h}h`;
  const m = Math.floor(diff / 60_000);
  return `há ${m}min`;
}

function EmailStatusCell({ s }: { s: EmailStatus | undefined }) {
  if (!s || s.total_sent === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
        <Clock className="w-3 h-3" /> Não enviado
      </span>
    );
  }
  const stageLabels: Record<string, string> = { d7: "D+7", d20: "D+20", d45: "D+45" };
  const badges: React.ReactNode[] = [];
  if (s.stage) {
    badges.push(
      <span key="stage" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/15 text-primary">
        {stageLabels[s.stage] ?? s.stage}
      </span>,
    );
  }
  if (s.converted_at) {
    badges.push(<span key="conv" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Voltou</span>);
  } else if (s.error) {
    badges.push(<span key="err" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-destructive/15 text-destructive" title={s.error}><XCircle className="w-3 h-3" /> Erro</span>);
  } else if (s.bounced_at) {
    badges.push(<span key="bnc" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-destructive/15 text-destructive"><XCircle className="w-3 h-3" /> Bounce</span>);
  } else if (s.clicked_at) {
    badges.push(<span key="clk" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700"><MousePointerClick className="w-3 h-3" /> Clicou</span>);
  } else if (s.opened_at) {
    badges.push(<span key="opn" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/15 text-blue-600"><Eye className="w-3 h-3" /> Abriu</span>);
  } else if (s.delivered_at) {
    badges.push(<span key="dlv" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-700"><CheckCircle2 className="w-3 h-3" /> Entregue</span>);
  } else {
    badges.push(<span key="snt" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700"><Send className="w-3 h-3" /> Enviado</span>);
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">{badges}</div>
      <div className="text-[10px] text-muted-foreground">
        {timeAgo(s.sent_at)} · {s.trigger === "manual" ? "manual" : "auto"}
        {s.total_sent > 1 && ` · ${s.total_sent}x`}
      </div>
    </div>
  );
}

function CanceladosPage() {
  const fetchFn = useServerFn(listCanceled);
  const sendFn = useServerFn(sendWinbackEmail);
  const statusFn = useServerFn(getWinbackStatusByEmails);
  const bulkFn = useServerFn(sendWinbackToAll);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-canceled"],
    queryFn: () => fetchFn(),
    refetchInterval: 5 * 60_000,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const emails = useMemo(() => rows.map((r) => r.email).filter((e): e is string => !!e), [rows]);

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["admin-canceled-status", emails.join(",")],
    queryFn: () => statusFn({ data: { emails } }),
    enabled: emails.length > 0,
    refetchInterval: 30_000,
  });
  const statusMap = statusData?.map ?? {};

  const send = useMutation({
    mutationFn: (vars: { email: string; name: string | null; productName: string | null; couponCode?: string }) => sendFn({ data: vars }),
    onMutate: (v) => setBusy(v.email),
    onSettled: () => { setBusy(null); void refetchStatus(); },
    onSuccess: (r) => toast.success(`Email enviado para ${r.sent_to}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const recipients = useMemo(() =>
    rows.filter((r) => !!r.email).map((r) => ({
      email: r.email as string,
      name: r.name,
      productName: r.product_name,
      daysSinceCancel: r.days_since_cancel,
    })), [rows]);

  const bulk = useMutation({
    mutationFn: () => bulkFn({ data: { recipients, couponCode: coupon || undefined } }),
    onSuccess: (r) => {
      toast.success(`Enviados: ${r.sent} · Falhas: ${r.failed} · Pulados: ${r.skipped}`);
      void refetchStatus();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalMrrLost = rows.reduce((s, r) => s + (r.interval === "month" ? r.amount_cents : 0), 0);
  const stats = useMemo(() => {
    const s = { sent: 0, opened: 0, clicked: 0, back: 0, errors: 0, pending: 0 };
    for (const r of rows) {
      const st = r.email ? statusMap[r.email] : undefined;
      if (!st || st.total_sent === 0) { s.pending++; continue; }
      s.sent++;
      if (st.opened_at) s.opened++;
      if (st.clicked_at) s.clicked++;
      if (st.converted_at) s.back++;
      if (st.error || st.bounced_at) s.errors++;
    }
    return s;
  }, [rows, statusMap]);


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

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
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
          <Button
            onClick={() => {
              if (recipients.length === 0) { toast.error("Nenhum email válido"); return; }
              if (confirm(`Enviar winback para ${recipients.length} cancelados? Estágio (D+7/D+20/D+45) escolhido automaticamente.`)) {
                bulk.mutate();
              }
            }}
            disabled={bulk.isPending || recipients.length === 0}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            {bulk.isPending ? "Enviando…" : `Enviar pra todos (${recipients.length})`}
          </Button>
        </div>
        {rows.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center text-xs pt-2 border-t border-border">
            <div><div className="text-base font-bold">{rows.length}</div><div className="text-muted-foreground">Total</div></div>
            <div><div className="text-base font-bold text-amber-600">{stats.pending}</div><div className="text-muted-foreground">A enviar</div></div>
            <div><div className="text-base font-bold text-sky-600">{stats.sent}</div><div className="text-muted-foreground">Enviados</div></div>
            <div><div className="text-base font-bold text-blue-600">{stats.opened}</div><div className="text-muted-foreground">Abriram</div></div>
            <div><div className="text-base font-bold text-emerald-600">{stats.back}</div><div className="text-muted-foreground">Voltaram</div></div>
            <div><div className="text-base font-bold text-destructive">{stats.errors}</div><div className="text-muted-foreground">Erros</div></div>
          </div>
        )}
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
                <th className="px-4 py-3 font-bold">Status email</th>
                <th className="px-4 py-3 font-bold text-right">Cancelou há</th>
                <th className="px-4 py-3 font-bold text-right">Valor</th>
                <th className="px-4 py-3 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const wa = normalizeBrPhone(r.phone);
                const code = (coupon || "VOLTA20").trim().toUpperCase();
                const checkoutUrl = `https://www.fastproxy.com.br/checkout?billing=yearly&coupon=${encodeURIComponent(code)}`;
                const firstName = r.name?.split(" ")[0] ?? "tudo bem";
                const waMsg =
                  `Oi ${firstName}! 👋 Aqui é da FastProxy.\n\n` +
                  `Vi que você cancelou${r.product_name ? ` o ${r.product_name}` : " seu plano"} e queria te chamar pra voltar com uma condição especial:\n\n` +
                  `🎁 Cupom *${code}* — 20% OFF no plano anual (economia maior ainda no anual).\n\n` +
                  `É só acessar: ${checkoutUrl}\n\n` +
                  `Posso te ajudar com algo? Qual foi o motivo do cancelamento?`;
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
