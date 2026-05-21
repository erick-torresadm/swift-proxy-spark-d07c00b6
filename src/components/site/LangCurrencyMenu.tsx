import { useState, useRef, useEffect } from "react";
import { Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";

export function LangCurrencyMenu({ className = "" }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const { currency, setCurrency, rate } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const lang = i18n.language?.startsWith("en") ? "en" : "pt";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full hover:bg-foreground/10 transition text-foreground text-sm"
        aria-label={t("common.language")}
      >
        <Globe className="w-4 h-4" />
        <span className="font-bold uppercase">{lang}</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-bold">{currency}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl backdrop-blur-xl overflow-hidden z-50">
          <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("common.language")}
          </div>
          {[
            { code: "pt", label: "Português", flag: "🇧🇷" },
            { code: "en", label: "English", flag: "🇺🇸" },
          ].map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLanguage(l.code as "pt" | "en");
                if (l.code === "en" && currency === "BRL") setCurrency("USD");
                if (l.code === "pt" && currency === "USD") setCurrency("BRL");
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-foreground/5 transition"
            >
              <span className="flex items-center gap-2">
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </span>
              {lang === l.code && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}

          <div className="border-t border-border mt-1 px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("common.currency")}
          </div>
          {[
            { code: "BRL", label: "Real (R$)" },
            { code: "USD", label: "US Dollar ($)" },
          ].map((c) => (
            <button
              key={c.code}
              onClick={() => setCurrency(c.code as "BRL" | "USD")}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-foreground/5 transition"
            >
              <span>{c.label}</span>
              {currency === c.code && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
            1 USD ≈ R$ {rate.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
