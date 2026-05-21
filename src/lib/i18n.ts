import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "@/i18n/pt.json";
import en from "@/i18n/en.json";

const STORAGE_KEY = "fp_lang";

function detectInitialLang(): "pt" | "en" {
  if (typeof window === "undefined") return "pt";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") return stored;
  } catch {}
  return "pt";
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        pt: { translation: pt },
        en: { translation: en },
      },
      lng: detectInitialLang(),
      fallbackLng: "pt",
      interpolation: { escapeValue: false },
    });
}

export function setLanguage(lng: "pt" | "en") {
  i18n.changeLanguage(lng);
  try { localStorage.setItem(STORAGE_KEY, lng); } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng === "pt" ? "pt-BR" : "en";
  }
}

export default i18n;
