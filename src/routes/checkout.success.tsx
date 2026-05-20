import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle2, Mail } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  order: z.string().optional(),
});

export const Route = createFileRoute("/checkout/success")({
  validateSearch: searchSchema,
  component: SuccessPage,
  head: () => ({ meta: [{ title: "Pagamento confirmado — FastProxy" }] }),
});

function SuccessPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5 py-14">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full bg-card border border-border rounded-3xl p-8 sm:p-10 text-center shadow-card"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-9 h-9 text-primary" />
        </div>
        <h1 className="text-3xl font-black font-display mb-3">
          Pagamento confirmado!
        </h1>
        <p className="text-muted-foreground mb-6">
          Recebemos seu pagamento e estamos preparando seus proxies.
        </p>

        <div className="rounded-2xl border border-border bg-background/60 p-5 text-left flex items-start gap-3 mb-6">
          <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/90">
            Acabamos de enviar um <strong>link de acesso</strong> para o seu email.
            Clique nele para ativar sua conta e ver seus proxies no painel.
            Não esqueça de checar a caixa de spam.
          </div>
        </div>

        <Link
          to="/login"
          className="inline-flex items-center justify-center w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:opacity-95 transition"
        >
          Ir para o login
        </Link>
        <Link
          to="/"
          className="block mt-3 text-xs text-muted-foreground hover:text-foreground"
        >
          Voltar ao site
        </Link>
      </motion.div>
    </div>
  );
}
