import { Download, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm">Instale o FastProxy</p>
          <p className="text-xs text-muted-foreground truncate">
            Acesso rápido, badge de expiração e notificações em tempo real.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => promptInstall()}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition"
        >
          Instalar
        </button>
        <button
          onClick={() => dismiss(30)}
          aria-label="Dispensar"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
