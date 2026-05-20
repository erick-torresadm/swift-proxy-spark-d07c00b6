import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Send, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { sendTestEmail, getEmailConfigStatus } from "@/lib/email.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/emails")({
  component: AdminEmailsPage,
});

function AdminEmailsPage() {
  const getStatus = useServerFn(getEmailConfigStatus);
  const send = useServerFn(sendTestEmail);

  const { data: status, isLoading } = useQuery({
    queryKey: ["email-config"],
    queryFn: () => getStatus(),
  });

  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    setSending(true);
    try {
      const r = await send({ data: { to } });
      toast.success(`Email enviado (id: ${r.id?.slice(0, 8) ?? "ok"})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="w-6 h-6 text-primary" /> Emails
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configuração do envio transacional via Resend.
        </p>
      </div>

      {/* Status */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Status
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Verificando…
          </div>
        ) : status?.hasApiKey ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-500 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Chave Resend conectada
            </div>
            <div className="text-sm">
              Remetente: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{status.from}</code>
            </div>
            {status.usingDefaultSender && (
              <div className="flex items-start gap-2 text-amber-500 text-xs mt-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Usando o remetente padrão do Resend (<code>onboarding@resend.dev</code>).
                  Ele só consegue enviar emails para o dono da conta Resend.
                  Para produção, verifique seu domínio em{" "}
                  <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline">
                    resend.com/domains
                  </a>{" "}
                  e defina <code>EMAIL_FROM</code> como segredo do projeto
                  (ex: <code>Fast Proxy &lt;no-reply@seudominio.com&gt;</code>).
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4" /> RESEND_API_KEY não configurada
          </div>
        )}
      </div>

      {/* Test send */}
      <form onSubmit={onSend} className="border border-border rounded-xl p-5 bg-card space-y-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Enviar email de teste
          </div>
          <p className="text-sm text-muted-foreground">
            Dispara um email de teste para validar a integração.
          </p>
        </div>
        <input
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="seu@email.com"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={sending || !status?.hasApiKey}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar teste
        </button>
      </form>

      {/* Triggers */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Eventos automáticos
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>Pagamento confirmado</span>
            <code className="text-xs text-muted-foreground">notifyOrderPaid</code>
          </li>
          <li className="flex items-center justify-between">
            <span>Proxies entregues</span>
            <code className="text-xs text-muted-foreground">notifyProxyDelivered</code>
          </li>
          <li className="flex items-center justify-between">
            <span>Aviso de renovação (3 dias)</span>
            <code className="text-xs text-muted-foreground">notifyRenewalWarning</code>
          </li>
          <li className="flex items-center justify-between">
            <span>Período de carência (inadimplência)</span>
            <code className="text-xs text-muted-foreground">notifyGracePeriod</code>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          Estes gatilhos serão chamados pelo motor de pedidos e pelas tarefas agendadas
          (Stripe webhook, cron de renovação, cron de grace period).
        </p>
      </div>
    </div>
  );
}
