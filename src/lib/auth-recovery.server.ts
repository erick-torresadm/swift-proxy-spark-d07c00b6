// Server-only: recuperação de senha / link mágico via API própria + Resend.
// Em vez de depender do template de email do Supabase, geramos os links com a
// service role (admin.generateLink) e enviamos nosso próprio email pelo Resend.
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { sendEmail, tplPasswordRecovery } from "@/lib/email.server";

function siteBaseUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "https://www.fastproxy.com.br"
  );
}

export interface RecoveryOutcome {
  sent: boolean;
}

/**
 * Gera links de redefinição de senha e de login (link mágico) e envia um único
 * email com ambos os botões. Se o email não existir, generateLink falha e nada
 * é enviado — o caller sempre retorna a mesma resposta (anti-enumeração).
 */
export async function sendPasswordRecoveryEmail(email: string): Promise<RecoveryOutcome> {
  const base = siteBaseUrl();

  const [recovery, magic] = await Promise.all([
    supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${base}/reset-password` },
    }),
    supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${base}/auth/callback` },
    }),
  ]);

  const recoveryUrl = recovery.error ? null : recovery.data?.properties?.action_link ?? null;
  const magicUrl = magic.error ? null : magic.data?.properties?.action_link ?? null;

  if (!recoveryUrl && !magicUrl) return { sent: false };

  const html = tplPasswordRecovery({
    email,
    resetUrl: recoveryUrl ?? magicUrl!,
    magicUrl: magicUrl ?? recoveryUrl!,
  });

  const result = await sendEmail({
    to: email,
    subject: "Recupere o acesso à sua conta — FastProxy",
    html,
    tags: [{ name: "kind", value: "auth-recovery" }],
    immediate: true,
  });

  return { sent: result.ok };
}
