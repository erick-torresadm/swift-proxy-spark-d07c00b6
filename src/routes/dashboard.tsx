import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Construction, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: "Painel — FastProxy" }],
  }),
});

function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg text-center"
      >
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition text-sm">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="bg-card border border-border rounded-3xl p-12 shadow-card">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-6 shadow-glow">
            <LayoutDashboard className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase mb-4">
            <Construction className="w-3 h-3" /> Próxima leva
          </div>
          <h1 className="text-3xl font-black mb-4">Painel do Cliente</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Aqui vão entrar: lista de proxies ativos, regeneração automática,
            histórico de pedidos, faturas e configurações da conta.
          </p>
          <Link to="/" className="inline-block w-full py-3 rounded-xl bg-gradient-primary text-primary-foreground font-bold">
            Voltar para a Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
