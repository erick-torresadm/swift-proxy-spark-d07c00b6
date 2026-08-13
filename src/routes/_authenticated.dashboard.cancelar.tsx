import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck, Sparkles, Gift, Package } from "lucide-react";
import { toast } from "sonner";
import {
  listMyCancellableOrders,
  cancelMySubscription,
  applyRetentionDiscount,
} from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard/cancelar")({
  component: CancelPage,
  head: () => ({ meta: [{ title: "Cancelar assinatura — FastProxy" }] }),
});

const REASONS: { value: "too_expensive" | "missing_features" | "switched_service" | "unused" | "customer_service" | "low_quality" | "too_complex" | "other"; label: string }[] = [
  { value: "too_expensive", label: "Preço alto demais" },
  { value: "missing_features", label: "Faltam recursos que eu preciso" },
  { value: "low_quality", label: "Qualidade dos proxies abaixo do esperado" },
  { value: "switched_service", label: "Vou usar outro provedor" },
  { value: "unused", label: "Não estou mais usando" },
  { value: "customer_service", label: "Problema com atendimento" },
  { value: "too_complex", label: "Achei complicado de usar" },
  { value: "other", label: "Outro motivo" },
];

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function CancelPage() {
  const fetchOrders = useServerFn(listMyCancellableOrders);
  const cancelFn = useServerFn(cancelMySubscription);
  const retentionFn = useServerFn(applyRetentionDiscount);
  const qc = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-cancellable-orders"],
    queryFn: () => fetchOrders(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState<typeof REASONS[number]["value"] | "">("");
  const [feedback, setFeedback] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showRetention, setShowRetention] = useState(false);
  const [done, setDone] = useState<null | { immediate: boolean; effective_at: string | null; retention?: boolean }>(null);

  const selected = useMemo(
    () => (orders ?? []).find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !reason) throw new Error("Selecione o proxy e o motivo.");
      return await cancelFn({
        data: {
          orderId: selectedId,
          reason,
          feedback: feedback.trim(),
          immediate,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.immediate
          ? "Assinatura cancelada e proxies liberados."
          : "Cancelamento agendado. Você mantém acesso até o fim do período.",
      );
      setShowRetention(false);
      setDone({ immediate: r.immediate, effective_at: r.effective_at });
      qc.invalidateQueries({ queryKey: ["my-cancellable-orders"] });
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      qc.invalidateQueries({ queryKey: ["my-overview"] });
      qc.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cancelar"),
  });

  const retentionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Selecione a assinatura.");
      return await retentionFn({ data: { orderId: selectedId } });
    },
    onSuccess: () => {
      toast.success("Pronto! 30% OFF aplicados na sua próxima fatura.");
      setShowRetention(false);
      setDone({ immediate: false, effective_at: null, retention: true });
      qc.invalidateQueries({ queryKey: ["my-cancellable-orders"] });
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      qc.invalidateQueries({ queryKey: ["my-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao aplicar desconto"),
  });

  if (done) {
    return (
      <div className="max-w-2xl">
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          {done.retention ? (
            <>
              <Gift className="w-12 h-12 text-primary mx-auto mb-3" />
              <h1 className="text-2xl font-black mb-2">Que ótimo! Desconto aplicado 🎉</h1>
              <p className="text-muted-foreground mb-6">
                <strong>30% OFF</strong> foram aplicados na sua próxima fatura automaticamente. Você não precisa fazer mais nada — a cobrança do próximo ciclo já vem com o desconto.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
              <h1 className="text-2xl font-black mb-2">Pronto, recebemos seu pedido</h1>
              <p className="text-muted-foreground mb-6">
                {done.immediate ? (
                  <>Sua assinatura foi cancelada agora e os proxies foram liberados.</>
                ) : (
                  <>
                    Você mantém acesso até <strong>{formatDate(done.effective_at)}</strong>. Nada será cobrado depois disso.
                  </>
                )}
              </p>
            </>
          )}
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>
      <h1 className="text-2xl sm:text-3xl font-black mb-1">Cancelar assinatura</h1>
      <p className="text-muted-foreground mb-6">
        Escolha qual assinatura deseja cancelar. Você pode ter mais de uma ativa.
      </p>

      {isLoading ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (orders?.length ?? 0) === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Você não tem nenhuma assinatura ativa pra cancelar.
          </p>
        </div>
      ) : (
        <>
          {/* 1) Escolher qual proxy/assinatura */}
          <section className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              1. Qual assinatura quer cancelar?
            </h2>
            <div className="grid gap-3">
              {(orders ?? []).map((o) => {
                const isSel = o.id === selectedId;
                const alreadyScheduled = o.cancel_at_period_end;
                return (
                  <button
                    key={o.id}
                    onClick={() => !alreadyScheduled && setSelectedId(o.id)}
                    disabled={alreadyScheduled}
                    className={`text-left bg-card border rounded-xl p-4 transition ${
                      alreadyScheduled
                        ? "opacity-60 cursor-not-allowed border-border"
                        : isSel
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border hover:border-primary/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-bold">{o.product_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {o.quantity} {o.block_size > 1 ? `× ${o.block_size} IPs` : o.quantity === 1 ? "proxy" : "proxies"} ·{" "}
                          {o.billing_cycle === "yearly" ? "Anual" : o.billing_cycle === "quarterly" ? "Trimestral" : o.billing_cycle === "semiannual" ? "Semestral" : "Mensal"} · {formatBRL(o.amount_cents)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {o.active_proxies} proxy(s) ativo(s) · Renova em {formatDate(o.current_period_end)}
                        </div>
                      </div>
                      {alreadyScheduled && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-400">
                          Já agendado
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selected && (
            <>
              {/* 2) Motivo */}
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  2. Qual o motivo?
                </h2>
                <div className="grid sm:grid-cols-2 gap-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm transition ${
                        reason === r.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/60"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="accent-primary"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </section>

              {/* 3) Feedback */}
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  3. Quer nos contar mais? (opcional)
                </h2>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value.slice(0, 1000))}
                  rows={4}
                  placeholder="O que poderíamos ter feito melhor?"
                  className="w-full bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-primary"
                />
                <div className="text-xs text-muted-foreground mt-1 text-right">
                  {feedback.length}/1000
                </div>
              </section>

              {/* 4) Quando */}
              <section className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  4. Quando?
                </h2>
                <div className="grid gap-2">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer text-sm transition ${
                      !immediate ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={!immediate}
                      onChange={() => setImmediate(false)}
                      className="accent-primary mt-0.5"
                    />
                    <div>
                      <div className="font-semibold">Cancelar no fim do período</div>
                      <div className="text-xs text-muted-foreground">
                        Recomendado. Você mantém os proxies até <strong>{formatDate(selected.current_period_end)}</strong> e não é cobrado de novo.
                      </div>
                    </div>
                  </label>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer text-sm transition ${
                      immediate ? "border-destructive bg-destructive/5" : "border-border hover:border-destructive/60"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={immediate}
                      onChange={() => setImmediate(true)}
                      className="accent-primary mt-0.5"
                    />
                    <div>
                      <div className="font-semibold">Cancelar agora</div>
                      <div className="text-xs text-muted-foreground">
                        Seus proxies são liberados imediatamente. Não há reembolso proporcional.
                      </div>
                    </div>
                  </label>
                </div>
              </section>

              {/* 5) Confirmação */}
              <section className="bg-destructive/5 border border-destructive/30 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-bold mb-1">Confirma o cancelamento?</div>
                    <p className="text-muted-foreground">
                      {immediate
                        ? "Seus proxies serão desativados agora."
                        : `Você manterá acesso até ${formatDate(selected.current_period_end)}.`}
                    </p>
                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        className="accent-destructive"
                      />
                      <span>Entendi e quero cancelar</span>
                    </label>
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowRetention(true)}
                  disabled={!reason || !confirmed || mutation.isPending}
                  className="px-5 py-2.5 rounded-lg bg-destructive text-destructive-foreground font-semibold text-sm hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {immediate ? "Cancelar agora" : "Confirmar cancelamento"}
                </button>
                <Link
                  to="/dashboard"
                  className="px-5 py-2.5 rounded-lg border border-border font-semibold text-sm hover:bg-foreground/5 transition"
                >
                  Voltar
                </Link>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal de oferta de retenção */}
      {showRetention && selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-primary/40 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Oferta exclusiva
            </div>
            <div className="text-center mb-5 mt-2">
              <Gift className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-2xl font-black mb-2">Espera! Antes de cancelar…</h2>
              <p className="text-sm text-muted-foreground">
                Temos duas alternativas que podem ser melhores pra você. Escolha uma:
              </p>
            </div>

            {/* Opção 1: migrar pra pacote prépago */}
            <Link
              to="/pacotes"
              className="block rounded-xl border border-primary/40 bg-primary/5 p-4 mb-3 hover:border-primary transition"
            >
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-sm mb-0.5 flex items-center gap-2">
                    Migre para pacote prépago
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-black uppercase tracking-wider">Novo</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pague uma vez, use por 3, 6 ou 12 meses. Sem renovação, preço travado, até <strong className="text-primary">-40%</strong> vs mensal.
                  </p>
                </div>
              </div>
            </Link>

            {/* Opção 2: 30% off */}
            <div className="rounded-xl border border-border p-4 mb-3">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-sm mb-0.5">Ganhe 30% OFF na próxima fatura</div>
                  <p className="text-xs text-muted-foreground">
                    Aplicado automaticamente, sem cupom. Continue mensal com desconto.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-5 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">Valor da próxima fatura</span>
                <span className="line-through text-muted-foreground">{formatBRL(selected.amount_cents)}</span>
              </div>
              <div className="flex justify-between font-bold text-primary">
                <span>Com o desconto</span>
                <span>{formatBRL(Math.round(selected.amount_cents * 0.7))}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => retentionMutation.mutate()}
                disabled={retentionMutation.isPending || mutation.isPending}
                className="w-full px-5 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition disabled:opacity-40"
              >
                {retentionMutation.isPending ? "Aplicando…" : "Quero o desconto de 30%"}
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={retentionMutation.isPending || mutation.isPending}
                className="w-full px-5 py-2.5 rounded-lg border border-border text-muted-foreground font-medium text-xs hover:text-foreground hover:bg-foreground/5 transition disabled:opacity-40"
              >
                {mutation.isPending ? "Cancelando…" : "Não, quero cancelar mesmo assim"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
