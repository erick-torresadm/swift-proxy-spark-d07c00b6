import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Server, Receipt, Clock, TrendingUp, ArrowRight, ShoppingCart, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getMyOverview } from "@/lib/dashboard.functions";
import { BuyMoreDialog } from "@/components/buy-more-dialog";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
  head: () => ({ meta: [{ title: "Painel — FastProxy" }] }),
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function DashboardHome() {
  const { user } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "cliente";
  const fetchOverview = useServerFn(getMyOverview);

  const { data, isLoading } = useQuery({
    queryKey: ["my-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30000,
  });

  const stats = [
    {
      label: "Proxies ativos",
      value: isLoading ? "…" : String(data?.active_proxies ?? 0),
      icon: Server,
      hint:
        (data?.active_proxies ?? 0) > 0
          ? "Ver credenciais em Meus proxies"
          : "Nenhum proxy contratado ainda",
    },
    {
      label: "Pedidos totais",
      value: isLoading ? "…" : String(data?.orders_count ?? 0),
      icon: Receipt,
      hint: (data?.orders_count ?? 0) > 0 ? "Ver histórico" : "Você ainda não tem pedidos",
    },
    {
      label: "Próxima renovação",
      value: isLoading ? "…" : formatDate(data?.next_renewal ?? null),
      icon: Clock,
      hint: data?.next_renewal ? "Cobrança automática" : "Sem renovações pendentes",
    },
    {
      label: "Gasto nos últimos 30d",
      value: isLoading ? "…" : formatBRL(data?.spent_30d_cents ?? 0),
      icon: TrendingUp,
      hint: "Soma dos pedidos pagos no período",
    },
  ];

  const hasProxies = (data?.active_proxies ?? 0) > 0;

  return (
    <div className="max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black mb-1">
              Olá, {firstName} 👋
            </h1>
            <p className="text-muted-foreground">
              Aqui está o resumo da sua conta.
            </p>
          </div>
          <BuyMoreDialog>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-glow hover:bg-primary/90 transition">
              <ShoppingCart className="w-4 h-4" />
              Comprar mais proxies
            </button>
          </BuyMoreDialog>
        </div>
      </motion.div>



      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                {s.label}
              </p>
              <s.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-black mb-1">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.hint}</p>
          </motion.div>
        ))}
      </div>

      {hasProxies ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/dashboard/proxies"
            className="bg-card border border-border rounded-2xl p-6 hover:border-primary transition group"
          >
            <Server className="w-6 h-6 text-primary mb-3" />
            <h2 className="font-bold mb-1">Meus proxies</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Veja host, porta, usuário e senha de cada proxy. Copie ou exporte
              em uma lista.
            </p>
            <span className="text-sm text-primary font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
              Abrir <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
          <Link
            to="/dashboard/orders"
            className="bg-card border border-border rounded-2xl p-6 hover:border-primary transition group"
          >
            <Receipt className="w-6 h-6 text-primary mb-3" />
            <h2 className="font-bold mb-1">Pedidos</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Histórico completo de assinaturas, status e datas de renovação.
            </p>
            <span className="text-sm text-primary font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
              Abrir <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-bold mb-1">Você ainda não tem proxies</h2>
          <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
            Assim que você contratar um plano, seus proxies aparecem aqui com
            host, porta, usuário, senha.
          </p>
          <BuyMoreDialog>
            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-glow hover:bg-primary/90 transition">
              <ShoppingCart className="w-4 h-4" />
              Comprar proxies agora
            </button>
          </BuyMoreDialog>
        </div>
      )}

    </div>
  );
}

