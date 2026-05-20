import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Construction } from "lucide-react";
import logo from "@/assets/logo-fastproxy.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "Entrar — FastProxy" }, { name: "description", content: "Acesse seu painel FastProxy." }],
  }),
});

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition text-sm">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="bg-card border border-border rounded-3xl p-10 shadow-card text-center">
          <img src={logo} alt="FastProxy" className="h-10 mx-auto mb-6" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase mb-4">
            <Construction className="w-3 h-3" /> Em construção
          </div>
          <h1 className="text-2xl font-bold mb-2">Login</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Sistema de autenticação será habilitado na próxima leva. Backend já está pronto.
          </p>
          <Link to="/" className="inline-block w-full py-3 rounded-xl bg-gradient-primary text-primary-foreground font-bold">
            Voltar para a Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
