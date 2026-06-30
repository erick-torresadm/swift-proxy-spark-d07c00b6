import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Mail, MessageCircle, Copy, ExternalLink, Send, CheckCircle2, Eye, MousePointerClick, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { listDelinquents, sendDunningEmail } from "@/lib/admin-kpis.functions";
import { getDunningStatusByOrders, sendDunningToAll, type EmailStatus } from "@/lib/dunning-status.functions";
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
  const badges: React.ReactNode[] = [];
  // Estágio
  const stageLabels: Record<string, string> = { d1: "D+1", d5: "D+5", d15: "D+15" };
  if (s.stage) {
    badges.push(
      <span key="stage" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/15 text-primary">
        {stageLabels[s.stage] ?? s.stage}
      </span>,
    );
  }
  // Resultado mais alto: convertido > clicado > aberto > entregue > erro > enviado
  if (s.converted_at) {
    badges.push(<span key="conv" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Pagou</span>);
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

function InadimplentesPage() {
  const fetchFn = useServerFn(listDelinquents);
  const sendFn = useServerFn(sendDunningEmail);
  const statusFn = useServerFn(getDunningStatusByOrders);
  const bulkFn = useServerFn(sendDunningToAll);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-delinquents"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const orderIds = useMemo(() => rows.map((r) => r.order_id).filter((x): x is string => !!x), [rows]);

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["admin-delinquents-status", orderIds.join(",")],
    queryFn: () => statusFn({ data: { orderIds } }),
    enabled: orderIds.length > 0,
    refetchInterval: 30_000,
  });
  const statusMap = statusData?.map ?? {};

  const [busyId, setBusyId] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (vars: { orderId?: string; userId?: string }) => sendFn({ data: vars }),
    onMutate: (v) => setBusyId(v.orderId ?? v.userId ?? null),
    onSettled: () => { setBusyId(null); void refetchStatus(); },
    onSuccess: (r) => toast.success(`Email enviado para ${r.sent_to}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: () => bulkFn({ data: { orderIds } }),
    onSuccess: (r) => {
      toast.success(`Enviados: ${r.sent} · Falhas: ${r.failed} · Pulados: ${r.skipped}`);
      void refetchStatus();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const s = { sent: 0, opened: 0, clicked: 0, paid: 0, errors: 0, pending: 0 };
    for (const r of rows) {
      const st = statusMap[r.order_id ?? ""];
      if (!st || st.total_sent === 0) { s.pending++; continue; }
      s.sent++;
      if (st.opened_at) s.opened++;
      if (st.clicked_at) s.clicked++;
      if (st.converted_at) s.paid++;
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
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Inadimplentes
        </h2>
        <p className="text-sm text-muted-foreground">
          Pedidos em <code>past_due</code> ou <code>grace</code>. Total: <strong>{rows.length}</strong>.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 grid grid-cols-3 md:grid-cols-6 gap-3 text-center text-xs">
            <div><div className="text-base font-bold">{rows.length}</div><div className="text-muted-foreground">Total</div></div>
            <div><div className="text-base font-bold text-amber-600">{stats.pending}</div><div className="text-muted-foreground">A enviar</div></div>
            <div><div className="text-base font-bold text-sky-600">{stats.sent}</div><div className="text-muted-foreground">Enviados</div></div>
            <div><div className="text-base font-bold text-blue-600">{stats.opened}</div><div className="text-muted-foreground">Abriram</div></div>
            <div><div className="text-base font-bold text-emerald-600">{stats.paid}</div><div className="text-muted-foreground">Pagaram</div></div>
            <div><div className="text-base font-bold text-destructive">{stats.errors}</div><div className="text-muted-foreground">Erros</div></div>
          </div>
          <Button
            onClick={() => {
              if (confirm(`Enviar cobrança para todos os ${rows.length} inadimplentes? O sistema escolhe o estágio (D+1, D+5 ou D+15) automaticamente.`)) {
                bulk.mutate();
              }
            }}
            disabled={bulk.isPending || orderIds.length === 0}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            {bulk.isPending ? "Enviando…" : `Enviar pra todos (${orderIds.length})`}
          </Button>
        </div>
      )}

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
                <th className="px-4 py-3 font-bold">Email</th>
                <th className="px-4 py-3 font-bold text-right">Atraso</th>
                <th className="px-4 py-3 font-bold text-right">Valor</th>
                <th className="px-4 py-3 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = r.order_id ?? r.user_id ?? "";
                const wa = waLink(r.phone, r.full_name, r.amount_cents, r.days_overdue);
                const st = r.order_id ? statusMap[r.order_id] : undefined;
                const hasErr = !!(st?.error || st?.bounced_at);
                return (
                  <tr key={id} className="border-t border-border hover:bg-muted/30 transition align-top">
                    <td className="px-4 py-3">
                      {r.user_id ? (
                        <Link to="/admin/customers/$userId" params={{ userId: r.user_id }} className="font-semibold hover:text-primary">
                          {r.full_name ?? "—"}
                        </Link>
                      ) : (
                        <span className="font-semibold">{r.full_name ?? "—"}</span>
                      )}
                      <div className="text-[11px] font-mono text-muted-foreground">{id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3 text-xs space-y-1">
                      {r.email ? (
                        <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => { navigator.clipboard.writeText(r.email!); toast.success("Email copiado"); }}>
                          <Mail className="w-3 h-3" /> {r.email} <Copy className="w-3 h-3 opacity-50" />
                        </button>
                      ) : (<span className="text-muted-foreground">sem email</span>)}
                      <br />
                      {r.phone ? (
                        <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => { navigator.clipboard.writeText(r.phone!); toast.success("Telefone copiado"); }}>
                          <MessageCircle className="w-3 h-3" /> {r.phone} <Copy className="w-3 h-3 opacity-50" />
                        </button>
                      ) : (<span className="text-muted-foreground">sem telefone</span>)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.status === "past_due" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600"
                      }`}>{r.status}</span>
                      <div className="text-[11px] text-muted-foreground mt-1">{r.billing_cycle ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3"><EmailStatusCell s={st} /></td>
                    <td className="px-4 py-3 text-right font-bold">{r.days_overdue}d</td>
                    <td className="px-4 py-3 text-right font-bold">{fmtBRL(r.amount_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25">
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant={hasErr ? "destructive" : "outline"}
                          disabled={!r.email || (send.isPending && busyId === id)}
                          onClick={() => send.mutate({ orderId: r.order_id ?? undefined, userId: r.user_id ?? undefined })}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {send.isPending && busyId === id ? "Enviando…" : hasErr ? "Reenviar" : "Enviar"}
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
        <Button size="sm" variant="ghost" onClick={() => { void refetch(); void refetchStatus(); }}>
          Atualizar lista
        </Button>
      </div>
    </div>
  );
}
