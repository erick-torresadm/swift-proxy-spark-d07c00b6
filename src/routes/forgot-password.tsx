import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase-custom/client";
import logo from "@/assets/logo-fastproxy.png";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({
    meta: [{ title: "Recuperar senha — FastProxy" }],
  }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Sempre mostra o mesmo sucesso — não revela se o email existe (anti-enumeração).
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para login
        </Link>

        <div className="bg-card border border-border rounded-3xl p-8 sm:p-10 shadow-card">
          <div className="text-center mb-8">
            <img src={logo} alt="FastProxy" className="h-9 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-1">Recuperar senha</h1>
            <p className="text-sm text-muted-foreground">
              Enviaremos um link para o seu email
            </p>
          </div>

          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MailCheck className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm text-foreground/90 mb-2">
                Email enviado para <span className="font-semibold">{email}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Cheque sua caixa de entrada (e o spam) e clique no link para
                escolher uma nova senha.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email da conta</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:outline-none transition text-sm"
                  placeholder="voce@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-glow hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enviar link
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
