// Google Ads conversion tracking helpers.
// Tag carregado em src/routes/__root.tsx — aqui só disparamos eventos.

const AW_ID = "AW-18182315422";

// Substitua pelos labels reais criados em Google Ads → Metas → Conversões.
// Formato esperado: "AbC-D_efGhIjKlMnO" (apenas a parte depois da "/").
const LABELS = {
  purchase: "REPLACE_ME_PURCHASE",
  lead_chat: "REPLACE_ME_LEAD_CHAT",
  sign_up: "REPLACE_ME_SIGN_UP",
} as const;

type ConversionName = keyof typeof LABELS;

type GtagFn = (...args: unknown[]) => void;
function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { gtag?: GtagFn };
  return typeof w.gtag === "function" ? w.gtag : null;
}

function isConfigured(name: ConversionName) {
  return !LABELS[name].startsWith("REPLACE_ME_");
}

export type ConversionParams = {
  value?: number;
  currency?: string;
  transaction_id?: string;
};

/**
 * Dispara uma conversão do Google Ads.
 * Idempotente por sessão quando `dedupeKey` é informado.
 */
export function trackConversion(
  name: ConversionName,
  params: ConversionParams = {},
  dedupeKey?: string,
) {
  const gtag = getGtag();
  if (!gtag) return;
  if (!isConfigured(name)) {
    if (typeof console !== "undefined") {
      console.warn(`[gtag] Conversion "${name}" sem label configurado.`);
    }
    return;
  }
  if (dedupeKey && typeof sessionStorage !== "undefined") {
    const k = `gtag_conv_${name}_${dedupeKey}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  }
  gtag("event", "conversion", {
    send_to: `${AW_ID}/${LABELS[name]}`,
    ...params,
  });
}

// ---------- Enhanced conversions ----------
// Hash em SHA-256 client-side; nada em texto puro é enviado.

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePhone(phone: string) {
  // E.164-ish: só dígitos, mantém prefixo "+" se houver.
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  // Heurística BR: 10-11 dígitos vira +55...
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/**
 * Define dados do usuário (hash) para enhanced conversions.
 * Chame ANTES de `trackConversion` quando tiver e-mail/telefone.
 */
export async function setUserData(input: { email?: string; phone?: string }) {
  const gtag = getGtag();
  if (!gtag) return;
  const userData: Record<string, string> = {};
  try {
    if (input.email && input.email.includes("@")) {
      userData.sha256_email_address = await sha256(input.email);
    }
    if (input.phone) {
      const normalized = normalizePhone(input.phone);
      if (normalized) userData.sha256_phone_number = await sha256(normalized);
    }
  } catch {
    return;
  }
  if (Object.keys(userData).length === 0) return;
  gtag("set", "user_data", userData);
}
