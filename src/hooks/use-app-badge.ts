import { useEffect } from "react";

/**
 * Atualiza o badge do ícone do PWA (quando suportado).
 * Silencioso onde não houver suporte (Firefox, Safari sem PWA, etc).
 */
export function useAppBadge(count: number | undefined | null) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const n = typeof count === "number" && count > 0 ? count : 0;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (n === 0 && nav.clearAppBadge) {
        nav.clearAppBadge().catch(() => {});
      } else if (nav.setAppBadge) {
        nav.setAppBadge(n).catch(() => {});
      }
    } catch {
      /* sem suporte */
    }
  }, [count]);
}
