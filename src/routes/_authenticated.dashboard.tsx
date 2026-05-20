import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Server, Receipt, Clock, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardHome,
  head: () => ({ meta: [{ title: "Painel — FastProxy" }] }),
});

const stats = [
  { label: "Proxies ativos", value: "0", icon: Server, hint: "Nenhum proxy contratado ainda" },
  { label: "Pedidos no mês", value: "0", icon: Receipt, hint: "Você ainda não tem pedidos" },
  { label: "Próximos vencimentos", value: "—", icon: Clock, hint: "Sem renovações pendentes" },
  { label: "Gasto no mês", value: "R$ 0,00", icon: TrendingUp, hint: "Comece em /planos" },
];

function DashboardHome() {
  const { user } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "cliente";

  return (
    <div className="max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black mb-1">
          Olá, {firstName} 👋
        </h1>
        <p className="text-muted-foreground mb-8">
          Aqui está o resumo da sua conta.
        </p>
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

      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h2 className="font-bold mb-1">Você ainda não tem proxies</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          Assim que você contratar um plano, seus proxies aparecem aqui com host, porta,
          usuário, senha e botão de rotação de IP.
        </p>
        <a
          href="/#planos"
          className="inline-flex px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-glow hover:bg-primary/90 transition"
        >
          Ver planos
        </a>
      </div>
    </div>
  );
}
