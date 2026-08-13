// API pública para solicitar recuperação de senha / link mágico.
// Gera os links com a service role (supabaseAdmin.generateLink) e envia o email
// pelo Resend (template próprio) em vez do email padrão do Supabase.
import { createFileRoute } from "@tanstack/react-router";
import { sendPasswordRecoveryEmail } from "@/lib/auth-recovery.server";
import { bumpRateLimit } from "@/lib/rate-limit.server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_SECONDS = 600; // 10 min
const PER_IP_LIMIT = 5;
const PER_EMAIL_LIMIT = 3;

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/auth/recovery")({
  server: {
    handlers: {
      GET: async () =>
        json({
          ok: true,
          info: "POST com body JSON { email } para enviar link de recuperação de senha.",
        }),

      POST: async ({ request }) => {
        let email = "";
        try {
          const body = await request.json();
          if (body && typeof body.email === "string") email = body.email.trim().toLowerCase();
        } catch {
          email = "";
        }

        // Anti-enumeração: resposta idêntica para email inexistente, inválido ou com rate limit.
        const neutral = json({ ok: true });

        if (!email || !EMAIL_RE.test(email) || email.length > 320) {
          return neutral;
        }

        const ip = getClientIp(request);
        const [ipRate, emailRate] = await Promise.all([
          bumpRateLimit("auth.recovery.ip", ip, WINDOW_SECONDS, PER_IP_LIMIT),
          bumpRateLimit("auth.recovery.email", email, WINDOW_SECONDS, PER_EMAIL_LIMIT),
        ]);

        if (!ipRate.allowed || !emailRate.allowed) {
          return neutral;
        }

        await sendPasswordRecoveryEmail(email);
        return neutral;
      },
    },
  },
});
