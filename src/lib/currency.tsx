import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { getUsdBrlRate } from "@/lib/fx.functions";

type Currency = "BRL" | "USD";

const CurrencyContext = createContext<{
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rate: number; // USD -> BRL
  /** Converte um valor em BRL para a moeda atual */
  convert: (brl: number) => number;
  /** Formata um valor BRL na moeda atual */
  format: (brl: number, opts?: { decimals?: number }) => string;
  /** Retorna { symbol, int, dec } para uso em UI customizada */
  parts: (brl: number) => { symbol: string; int: string; dec: string };
}>({
  currency: "BRL",
  setCurrency: () => {},
  rate: 5,
  convert: (b) => b,
  format: (b) => b.toFixed(2),
  parts: () => ({ symbol: "R$", int: "0", dec: "00" }),
});

const STORAGE_KEY = "fp_currency";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [currency, setCurrencyState] = useState<Currency>("BRL");
  const [rate, setRate] = useState(5);
  const fetchRate = useServerFn(getUsdBrlRate);

  // Inicialização: idioma EN => USD por padrão, senão BRL (a menos que usuário salvou)
  useEffect(() => {
    let initial: Currency = "BRL";
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Currency | null;
      if (stored === "BRL" || stored === "USD") initial = stored;
      else if (i18n.language === "en") initial = "USD";
    } catch {}
    setCurrencyState(initial);
  }, [i18n.language]);

  // Buscar taxa
  useEffect(() => {
    fetchRate()
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, [fetchRate]);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  };

  const convert = (brl: number) => (currency === "USD" ? brl / rate : brl);

  const format = (brl: number, opts?: { decimals?: number }) => {
    const v = convert(brl);
    const decimals = opts?.decimals ?? 2;
    if (currency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(v);
    }
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v);
  };

  const parts = (brl: number) => {
    const v = convert(brl);
    const [int, dec] = v.toFixed(2).split(".");
    return { symbol: currency === "USD" ? "$" : "R$", int, dec };
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rate, convert, format, parts }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
