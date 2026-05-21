import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { toast } from "sonner";

const STORAGE_KEY = "fp_notif_prompt_dismissed_at";
const SNOOZE_DAYS = 7;

/**
 * Banner suave que aparece ao entrar no painel pedindo permissão de notificação.
 * Não usamos requestPermission automático — navegadores bloqueiam sem gesto do usuário.
 */
export function NotificationPrompt() {
  const push = usePushSubscription();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (push.loading) return;
    if (!push.supported) return;
    if (push.blockedInPreview) return;
    if (push.subscribed) return;
    if (push.permission === "denied") return;

    // Em iOS só dá pra inscrever se estiver instalado como PWA
    if (push.isIOS && !push.isStandalone) return;

    try {
      const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) || 0);
      const days = (Date.now() - dismissedAt) / 86400000;
      if (dismissedAt && days < SNOOZE_DAYS) return;
    } catch {
      /* ignora */
    }

    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, [push.loading, push.supported, push.blockedInPreview, push.subscribed, push.permission, push.isIOS, push.isStandalone]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignora */
    }
    setShow(false);
  }

  async function accept() {
    try {
      await push.enable();
      toast.success("Notificações ativadas!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ativar");
    } finally {
      dismiss();
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur p-4 shadow-elegant">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Ativar notificações?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Avisamos sobre expiração, renovação, novos proxies e suporte. Pode desativar a qualquer momento.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={accept}
                disabled={push.loading}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition disabled:opacity-50"
              >
                Aceitar
              </button>
              <button
                onClick={dismiss}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition"
              >
                Agora não
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Fechar"
            className="p-1 -mt-1 -mr-1 rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
