import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase-custom/client";
import logo from "@/assets/logo-fastproxy.png";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  head: () => ({
    meta: [{ title: "Entrando… — FastProxy" }],
  }),
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    // O Supabase entrega o token de sessão no hash da URL; o client SDK detecta
    // automaticamente e dispara onAuthStateChange. Assim que houver sessão, vamos
    // para o dashboard.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (done.current) return;
      if (session || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        done.current = true;
        navigate({ to: "/dashboard", replace: true });
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (done.current) return;
      if (data.session) {
        done.current = true;
        navigate({ to: "/dashboard", replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-3xl p-8 sm:p-10 shadow-card text-center">
          <img src={logo} alt="FastProxy" className="h-9 mx-auto mb-6" />
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-4 text-primary" />
          <h1 className="text-lg font-bold mb-1">Entrando na sua conta…</h1>
          <p className="text-sm text-muted-foreground">
            Aguarde enquanto confirmamos seu acesso
          </p>
        </div>
      </motion.div>
    </div>
  );
}
