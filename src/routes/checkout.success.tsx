import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Mail,
  Loader2,
  LayoutDashboard,
  Server,
  AlertCircle,
  Zap,
  Clock,
  Sparkles,
} from "lucide-react";
import { z } from "zod";
import { getOrderPublicStatus, syncMyAllocations, reconcileOrderPublic } from "@/lib/dashboard.functions";
import { createAnnualUpgradeSession } from "@/lib/upsell.functions";
import { useAuth } from "@/hooks/use-auth";
import { pixelTrack, purchaseEventId } from "@/lib/meta-pixel";

const searchSchema = z.object({
  order: z.string().uuid().optional(),
  upsell: z.coerce.number().optional(),
  upsell_canceled: z.coerce.number().optional(),
});


export const Route = createFileRoute("/checkout/success")({
  validateSearch: searchSchema,
  component: SuccessPage,
  head: () => ({ meta: [{ title: "Pagamento confirmado — FastProxy" }] }),
});

type OrderStatus = Awaited<ReturnType<typeof getOrderPublicStatus>>;

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function SuccessPage() {
  const { order: orderId } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const fetchOrder = useServerFn(getOrderPublicStatus);
  const syncAllocations = useServerFn(syncMyAllocations);
  const reconcile = useServerFn(reconcileOrderPublic);

  const [order, setOrder] = useState<OrderStatus>(null);
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setPolling(false);
      setError("Pedido não informado na URL.");
      return;
    }

    let cancelled = false;
    const MAX = 30; // ~60s
    let i = 0;
    let triedSync = false;
    let triedReconcile = false;

    async function tick() {
      i++;
      setAttempts(i);
      try {
        const data = await fetchOrder({ data: { orderId: orderId! } });
        if (cancelled) return;
        setOrder(data);

        // Pago no Stripe mas ainda pending no nosso DB → força reconcile (1x)
        if (data?.status === "pending" && !triedReconcile && i >= 2) {
          triedReconcile = true;
          try {
            await reconcile({ data: { orderId: orderId! } });
          } catch {
            /* tentamos de novo no próximo tick via polling normal */
          }
        }

        // Pago mas sem proxies → dispara sync (1x) e continua polling
        if (
          data?.status === "paid" &&
          (data.allocated_count ?? 0) === 0 &&
          !triedSync &&
          user
        ) {
          triedSync = true;
          try {
            const r = await syncAllocations();
            if (!cancelled && r.error) setSyncError(r.error);
          } catch (e) {
            if (!cancelled) {
              setSyncError(e instanceof Error ? e.message : String(e));
            }
          }
        }

        // Sucesso completo: pago E alocado
        if (data?.status === "paid" && (data.allocated_count ?? 0) > 0) {
          setPolling(false);
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro consultando pedido");
      }
      if (i >= MAX) {
        setPolling(false);
        return;
      }
      setTimeout(tick, 2000);
    }

    tick();
    return () => {
      cancelled = true;
    };
  }, [orderId, fetchOrder, syncAllocations, reconcile, user]);

  const isPaid = order?.status === "paid";
  const isLoggedIn = !!user && !authLoading;

  // Fire Pixel Purchase exactly once per order, deduped against CAPI by event_id
  useEffect(() => {
    if (!isPaid || !order || !orderId) return;
    const key = `fbq_purchase_sent_${orderId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    pixelTrack(
      "Purchase",
      {
        value: order.amount_cents / 100,
        currency: "BRL",
        content_ids: [order.product_slug ?? "order"],
        content_type: "product",
        contents: [{ id: order.product_slug ?? "order", quantity: order.quantity, item_price: order.amount_cents / order.quantity / 100 }],
        num_items: order.quantity,
        order_id: orderId,
      },
      { eventID: purchaseEventId(orderId) },
    );
  }, [isPaid, order, orderId]);


  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5 py-14">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-xl w-full bg-card border border-border rounded-3xl p-8 sm:p-10 shadow-card"
      >
        {/* Header */}
        <div className="text-center">
          {polling && !isPaid ? (
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center mb-5">
              <Loader2 className="w-9 h-9 text-primary animate-spin" />
            </div>
          ) : isPaid ? (
            <motion.div
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center mb-5"
            >
              <CheckCircle2 className="w-9 h-9 text-primary" />
            </motion.div>
          ) : (
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-400/15 flex items-center justify-center mb-5">
              <AlertCircle className="w-9 h-9 text-amber-400" />
            </div>
          )}

          <h1 className="text-3xl font-black font-display mb-2">
            {polling && !isPaid
              ? "Confirmando seu pagamento…"
              : isPaid
                ? "Pagamento confirmado!"
                : "Pagamento em processamento"}
          </h1>
          <p className="text-muted-foreground">
            {polling && !isPaid
              ? "Isso costuma levar alguns segundos."
              : isPaid
                ? "Seus proxies já estão prontos."
                : "Você receberá um email assim que for confirmado."}
          </p>
        </div>

        {/* Order summary */}
        {order && (
          <div className="mt-7 rounded-2xl border border-border bg-background/60 p-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produto</span>
              <span className="font-semibold text-right">{order.product_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantidade</span>
              <span className="font-semibold">
                {order.quantity * order.block_size} proxies
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ciclo</span>
              <span className="font-semibold">
                {order.billing_cycle === "yearly" ? "Anual" : "Mensal"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary">
                {formatBRL(order.amount_cents)}
              </span>
            </div>
            {isPaid && (
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">Proxies prontos</span>
                <span
                  className={`font-bold ${
                    order.allocated_count > 0 ? "text-primary" : "text-amber-400"
                  }`}
                >
                  {order.allocated_count} / {order.quantity * order.block_size}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Body messages */}
        {polling && !isPaid && (
          <div className="mt-6 text-center text-xs text-muted-foreground">
            Tentativa {attempts}/30…
          </div>
        )}

        {!polling && !isPaid && (
          <div className="mt-6 p-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm">
            Ainda não recebemos a confirmação do Stripe. Não se preocupe — assim
            que cair, enviamos um email e seus proxies aparecem no painel.
          </div>
        )}

        {isPaid && !isLoggedIn && (
          <div className="mt-6 p-4 rounded-xl border border-border bg-background/60 flex items-start gap-3">
            <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm text-foreground/90">
              Enviamos um <strong>link de acesso</strong> para o e-mail
              cadastrado na compra. Clique nele para entrar no painel e ver
              suas credenciais. Cheque também a caixa de spam.
            </div>
          </div>
        )}

        {isPaid && isLoggedIn && order?.allocated_count === 0 && (
          <div className="mt-6 p-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm">
            {polling ? (
              <>
                <strong>Liberando seus proxies…</strong> Estamos preparando
                tudo para você. Pode levar até <strong>10 minutos</strong> em
                alguns produtos (IPv4 / ISP) porque o IP é provisionado sob
                demanda no provedor.
              </>
            ) : (
              <>
                Pagamento confirmado. Seu proxy está sendo provisionado no
                provedor — aguarde até <strong>10 minutos</strong> e atualize
                a página <strong>Meus proxies</strong>. Se nada aparecer
                depois disso, clique em <strong>Sincronizar agora</strong> ou
                fale com o suporte.
              </>
            )}
            {syncError && (
              <div className="mt-2 text-xs opacity-80">
                Detalhe técnico: {syncError}
              </div>
            )}
          </div>
        )}

        {error && !order && (
          <div className="mt-6 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* CTAs */}
        <div className="mt-7 space-y-2">
          {isLoggedIn ? (
            <Link
              to="/dashboard/proxies"
              className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <Server className="w-4 h-4" />
              Ver meus proxies
            </Link>
          ) : isPaid ? (
            <Link
              to="/login"
              className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Já tenho conta — fazer login
            </Link>
          ) : null}
          <Link
            to="/"
            className="block w-full text-center py-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Voltar ao site
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
