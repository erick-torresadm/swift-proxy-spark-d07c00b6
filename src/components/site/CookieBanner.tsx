import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "fp_lgpd_consent_v1";

type Consent = "accepted" | "rejected" | "essential";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (!v) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const decide = (choice: Consent) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ choice, ts: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies — LGPD"
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-6 sm:pb-6"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md sm:p-5">
        <div className="flex items-start gap-3">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground sm:text-base">
              Usamos cookies 🍪
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Utilizamos cookies essenciais para o funcionamento do site e, com
              seu consentimento, cookies de análise para melhorar sua
              experiência. Em conformidade com a{" "}
              <strong>LGPD (Lei 13.709/2018)</strong>. Saiba mais na nossa{" "}
              <Link
                to="/privacidade"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Política de Privacidade
              </Link>
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => decide("accepted")}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:opacity-90 sm:text-sm"
              >
                Aceitar todos
              </button>
              <button
                onClick={() => decide("essential")}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition hover:bg-secondary sm:text-sm"
              >
                Apenas essenciais
              </button>
              <button
                onClick={() => decide("rejected")}
                className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:text-sm"
              >
                Recusar
              </button>
            </div>
          </div>
          <button
            onClick={() => decide("essential")}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
