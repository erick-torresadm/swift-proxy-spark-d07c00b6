import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase-custom/client";
import logo from "@/assets/logo-fastproxy.png";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [{ title: "Nova senha — FastProxy" }],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Apps de email no celular (Gmail, Outlook) costumam pré-abrir os links
    // por segurança (link scanning) antes do usuário clicar de verdade — isso
    // consome o token de recovery de uso único, e o Supabase redireciona de
    // volta com "error"/"error_description" no hash em vez de uma sessão.
    // Sem tratar isso, a tela ficava presa em "Validando..." pra sempre.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashError = hashParams.get("error_description") || hashParams.get("error");
    if (hashError) {
      setLinkError(decodeURIComponent(hashError.replace(/\+/g, " ")));
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    // Timeout: se nada acontecer em alguns segundos, o link provavelmente já
    // foi consumido (ou é inválido/expirado) — melhor avisar do que travar
    // "Validando..." pra sempre.
    const timeout = setTimeout(() => {
      setReady((current) => {
        if (!current) {
          setLinkError(
            "Link inválido, expirado ou já usado. Peça um novo link de recuperação.",
          );
        }
        return current;
      });
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada. Você já está logado!");
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
        <div className="bg-card border border-border rounded-3xl p-8 sm:p-10 shadow-card">
          <div className="text-center mb-8">
            <img src={logo} alt="FastProxy" className="h-9 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-1">Nova senha</h1>
            <p className="text-sm text-muted-foreground">
              Escolha uma senha forte (mínimo 8 caracteres)
            </p>
          </div>

          {linkError ? (
            <div className="text-center py-6">
              <p className="text-sm text-destructive mb-4">{linkError}</p>
              <a
                href="/forgot-password"
                className="inline-block text-sm font-semibold text-primary hover:underline"
              >
                Pedir novo link de recuperação
              </a>
            </div>
          ) : !ready ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
              Validando link de recuperação…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Nova senha</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:outline-none transition text-sm"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Confirmar senha</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                Salvar nova senha
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
