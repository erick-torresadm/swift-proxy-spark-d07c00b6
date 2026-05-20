import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Construction, CreditCard } from "lucide-react";
import { z } from "zod";

const checkoutSearch = z.object({
  plan: z.enum(["ipv6", "ipv4", "isp"]).optional(),
});

export const Route = createFileRoute("/checkout")({
  validateSearch: checkoutSearch,
  component: CheckoutPage,
  head: () => ({
    meta: [{ title: "Checkout — FastProxy" }],
  }),
});

function CheckoutPage() {
  const { plan } = Route.useSearch();
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
            <CreditCard className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase mb-4">
            <Construction className="w-3 h-3" /> Próxima leva
          </div>
          <h1 className="text-3xl font-black mb-4">Checkout</h1>
          {plan && (
            <p className="text-sm text-muted-foreground mb-2">
              Plano selecionado: <span className="text-primary font-bold uppercase">{plan}</span>
            </p>
          )}
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Pagamentos via Stripe (Pix, cartão recorrente e boleto) serão
            habilitados na próxima leva. Toda a estrutura está pronta.
          </p>
          <Link to="/" className="inline-block w-full py-3 rounded-xl bg-gradient-primary text-primary-foreground font-bold">
            Voltar para a Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
