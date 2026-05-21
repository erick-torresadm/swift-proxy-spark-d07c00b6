import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase-custom/client";
import { lovable } from "@/integrations/lovable";
import logo from "@/assets/logo-fastproxy.png";

async function handleGoogleSignIn(setGoogleLoading: (v: boolean) => void) {
  setGoogleLoading(true);
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin + "/dashboard",
  });
  if (result.error) {
    setGoogleLoading(false);
    toast.error("Não foi possível entrar com Google.");
    return;
  }
  if (result.redirected) return;
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar — FastProxy" },
      { name: "description", content: "Acesse seu painel FastProxy." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "Email ou senha inválidos."
        : error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
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
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="bg-card border border-border rounded-3xl p-8 sm:p-10 shadow-card">
          <div className="text-center mb-8">
            <img src={logo} alt="FastProxy" className="h-9 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-1">Entrar</h1>
            <p className="text-sm text-muted-foreground">
              Acesse o painel da sua conta
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium">Senha</label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:outline-none transition text-sm"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-glow hover:bg-primary/90 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Entrar
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Não tem conta?{" "}
            <Link to="/signup" className="text-primary hover:underline font-semibold">
              Criar conta
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
