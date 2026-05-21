import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Bell, Mail, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  adminSendPush,
  adminSendEmail,
  listUsersForBroadcast,
} from "@/lib/admin-broadcast.functions";

export const Route = createFileRoute("/_authenticated/admin/broadcast")({
  component: BroadcastPage,
});

type Channel = "push" | "email";
type TargetKind = "all" | "user";

function BroadcastPage() {
  const [channel, setChannel] = useState<Channel>("push");
  const [targetKind, setTargetKind] = useState<TargetKind>("all");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [search, setSearch] = useState("");

  // Push form
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("/dashboard");
  const [pushRequireInteraction, setPushRequireInteraction] = useState(false);
  const [pushPersist, setPushPersist] = useState(true);

  // Email form
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHeading, setEmailHeading] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailCtaLabel, setEmailCtaLabel] = useState("");
  const [emailCtaUrl, setEmailCtaUrl] = useState("");

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; channel: Channel; recipients: number; sent: number; failed: number }
    | { ok: false; error: string }
    | null
  >(null);

  const listUsersFn = useServerFn(listUsersForBroadcast);
  const sendPushFn = useServerFn(adminSendPush);
  const sendEmailFn = useServerFn(adminSendEmail);

  const { data: users } = useQuery({
    queryKey: ["broadcast-users"],
    queryFn: () => listUsersFn(),
  });

  const filteredUsers = (users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (u.full_name ?? "").toLowerCase().includes(s) ||
      (u.email ?? "").toLowerCase().includes(s) ||
      (u.phone ?? "").toLowerCase().includes(s)
    );
  });

  const selectedUser = (users ?? []).find((u) => u.user_id === targetUserId);

  async function handleSend() {
    setResult(null);
    if (targetKind === "user" && !targetUserId) {
      setResult({ ok: false, error: "Selecione um cliente." });
      return;
    }
    setSending(true);
    try {
      const target =
        targetKind === "all"
          ? ({ kind: "all" } as const)
          : ({ kind: "user", userId: targetUserId } as const);

      if (channel === "push") {
        if (!pushTitle.trim() || !pushBody.trim()) {
          throw new Error("Título e mensagem do push são obrigatórios.");
        }
        const r = await sendPushFn({
          data: {
            target,
            title: pushTitle.trim(),
            body: pushBody.trim(),
            url: pushUrl.trim(),
            requireInteraction: pushRequireInteraction,
            persist: pushPersist,
          },
        });
        setResult({ ok: true, channel: "push", ...r });
      } else {
        if (!emailSubject.trim() || !emailMessage.trim()) {
          throw new Error("Assunto e mensagem do email são obrigatórios.");
        }
        const r = await sendEmailFn({
          data: {
            target,
            subject: emailSubject.trim(),
            heading: emailHeading.trim(),
            message: emailMessage.trim(),
            ctaLabel: emailCtaLabel.trim(),
            ctaUrl: emailCtaUrl.trim(),
          },
        });
        setResult({ ok: true, channel: "email", ...r });
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Falha" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Megaphone className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Notificações personalizadas</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Envie push (PWA) ou email para todos os clientes ou apenas um. Cada canal tem seu próprio conteúdo.
      </p>

      {/* Tabs de canal */}
      <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-border mb-6">
        <button
          onClick={() => setChannel("push")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
            channel === "push" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bell className="w-4 h-4" /> Push (PWA)
        </button>
        <button
          onClick={() => setChannel("email")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
            channel === "email" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="w-4 h-4" /> Email
        </button>
      </div>

      {/* Destinatário */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-6 space-y-4">
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Destinatário</h3>
        <div className="flex gap-2">
          <button
            onClick={() => { setTargetKind("all"); setTargetUserId(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              targetKind === "all" ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/40 text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            Todos os clientes
          </button>
          <button
            onClick={() => setTargetKind("user")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
              targetKind === "user" ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/40 text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            Cliente específico
          </button>
        </div>

        {targetKind === "user" && (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Buscar por nome, email ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {filteredUsers.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum cliente encontrado.</p>
              )}
              {filteredUsers.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => setTargetUserId(u.user_id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition ${
                    targetUserId === u.user_id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="font-semibold">{u.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.email ?? "sem email"} {u.phone ? `· ${u.phone}` : ""}
                  </div>
                </button>
              ))}
            </div>
            {selectedUser && (
              <p className="text-xs text-primary">
                Selecionado: <b>{selectedUser.full_name ?? selectedUser.email}</b>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Form PUSH */}
      {channel === "push" && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Conteúdo do push</h3>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Título *</label>
            <input
              maxLength={80}
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              placeholder="Ex.: Novo recurso disponível 🎉"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{pushTitle.length}/80</p>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Mensagem *</label>
            <textarea
              maxLength={300}
              rows={3}
              value={pushBody}
              onChange={(e) => setPushBody(e.target.value)}
              placeholder="Texto curto que aparece na notificação."
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{pushBody.length}/300</p>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Link ao clicar</label>
            <input
              value={pushUrl}
              onChange={(e) => setPushUrl(e.target.value)}
              placeholder="/dashboard"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pushRequireInteraction}
                onChange={(e) => setPushRequireInteraction(e.target.checked)}
              />
              Exigir interação (notificação fica até o usuário clicar)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pushPersist}
                onChange={(e) => setPushPersist(e.target.checked)}
              />
              Salvar também no histórico de notificações do cliente
            </label>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-dashed border-border p-4 bg-muted/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Pré-visualização</p>
            <div className="bg-background rounded-lg p-3 shadow-sm border border-border">
              <div className="font-bold text-sm">{pushTitle || "Título do push"}</div>
              <div className="text-xs text-muted-foreground mt-1">{pushBody || "Mensagem do push aparece aqui."}</div>
            </div>
          </div>
        </div>
      )}

      {/* Form EMAIL */}
      {channel === "email" && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Conteúdo do email</h3>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Assunto *</label>
            <input
              maxLength={200}
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Ex.: Atualização importante sobre seu plano"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Título dentro do email</label>
            <input
              maxLength={200}
              value={emailHeading}
              onChange={(e) => setEmailHeading(e.target.value)}
              placeholder="Padrão: mesmo do assunto"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">Mensagem *</label>
            <textarea
              rows={8}
              maxLength={5000}
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              placeholder="Escreva o conteúdo. Quebras de linha duplas viram parágrafos."
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{emailMessage.length}/5000</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground">Texto do botão</label>
              <input
                value={emailCtaLabel}
                onChange={(e) => setEmailCtaLabel(e.target.value)}
                placeholder="Ex.: Abrir painel"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">Link do botão</label>
              <input
                value={emailCtaUrl}
                onChange={(e) => setEmailCtaUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Ação */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 disabled:opacity-60"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending
            ? "Enviando…"
            : channel === "push"
              ? `Enviar push ${targetKind === "all" ? "para todos" : "para o cliente"}`
              : `Enviar email ${targetKind === "all" ? "para todos" : "para o cliente"}`}
        </button>

        {result && result.ok && (
          <div className="inline-flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle2 className="w-4 h-4" />
            {result.channel === "push"
              ? `Push enviado para ${result.recipients} cliente(s) · ${result.sent} entregue(s), ${result.failed} falha(s).`
              : `Email enviado para ${result.recipients} destinatário(s) · ${result.sent} ok, ${result.failed} falha(s).`}
          </div>
        )}
        {result && !result.ok && (
          <div className="inline-flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            {result.error}
          </div>
        )}
      </div>
    </div>
  );
}
