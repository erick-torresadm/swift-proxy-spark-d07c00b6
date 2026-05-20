import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Smartphone,
  MonitorSmartphone,
  Apple,
  Share,
  Plus,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import {
  listMyNotifications,
  markNotificationRead,
  sendTestNotification,
  disableAllPush,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/dashboard/notificacoes")({
  component: NotificationsPage,
  head: () => ({ meta: [{ title: "Notificações — FastProxy" }] }),
});

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

function NotificationsPage() {
  const push = usePushSubscription();
  const [tab, setTab] = useState<"android" | "ios" | "desktop">(
    push.isIOS ? "ios" : push.isAndroid ? "android" : "desktop",
  );

  const qc = useQueryClient();
  const fetchList = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const sendTest = useServerFn(sendTestNotification);
  const disableAll = useServerFn(disableAllPush);

  const { data: notifs = [] } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchList(),
    refetchInterval: 15000,
  });

  const readMut = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const testMut = useMutation({
    mutationFn: () => sendTest(),
    onSuccess: () => {
      toast.success("Notificação de teste enviada!");
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disableAllMut = useMutation({
    mutationFn: async () => {
      await disableAll();
      await push.disable();
    },
    onSuccess: () => toast.success("Notificações desativadas em todos os dispositivos."),
    onError: (e: Error) => toast.error(e.message),
  });

  const canEnable =
    push.supported && !push.blockedInPreview && (!push.isIOS || push.isStandalone);

  return (
    <div className="max-w-4xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Notificações</h1>
        <p className="text-muted-foreground">
          Receba avisos sobre expiração, renovação, rotação e promoções direto no seu
          aparelho.
        </p>
      </motion.div>

      {/* Status card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        {push.loading ? (
          <p className="text-sm text-muted-foreground">Verificando suporte…</p>
        ) : push.blockedInPreview ? (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Pré-visualização não suporta push</p>
              <p className="text-sm text-muted-foreground">
                Você está vendo a versão de pré-visualização. Notificações funcionam
                apenas no app publicado.
              </p>
            </div>
          </div>
        ) : !push.supported ? (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Seu navegador não suporta push</p>
              <p className="text-sm text-muted-foreground">
                Use Chrome, Edge, Firefox ou Safari atualizados.
              </p>
            </div>
          </div>
        ) : push.subscribed ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-bold">Notificações ativadas</p>
                <p className="text-sm text-muted-foreground">
                  Este dispositivo vai receber avisos.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending}
                className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-background transition"
              >
                {testMut.isPending ? "Enviando…" : "Enviar teste"}
              </button>
              <button
                onClick={() => push.disable()}
                className="px-4 py-2 rounded-xl border border-border text-sm font-semibold inline-flex items-center gap-2 hover:bg-background transition"
              >
                <BellOff className="w-4 h-4" /> Desativar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold">Ativar notificações</p>
                <p className="text-sm text-muted-foreground">
                  {push.permission === "denied"
                    ? "Permissão bloqueada — desbloqueie no navegador."
                    : push.isIOS && !push.isStandalone
                    ? "No iPhone, instale o app primeiro (passo a passo abaixo)."
                    : "Clique para permitir avisos."}
                </p>
              </div>
            </div>
            {canEnable && push.permission !== "denied" && (
              <button
                onClick={() => push.enable()}
                disabled={push.loading}
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-glow hover:bg-primary/90 transition inline-flex items-center gap-2"
              >
                <Bell className="w-4 h-4" /> Ativar agora
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tutorial */}
      <div>
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Instale o app
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          O FastProxy funciona como aplicativo no seu celular. Instalar é grátis,
          ocupa quase nada e libera as notificações no iPhone.
        </p>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { id: "android", label: "Android", icon: Smartphone },
            { id: "ios", label: "iPhone", icon: Apple },
            { id: "desktop", label: "Computador", icon: MonitorSmartphone },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          {tab === "android" && (
            <ol className="space-y-3 text-sm">
              <Step n={1}>Abra este site no <strong>Chrome</strong>.</Step>
              <Step n={2}>
                Toque no menu <strong>⋮</strong> no canto superior direito.
              </Step>
              <Step n={3}>
                Toque em <strong>"Instalar app"</strong> ou{" "}
                <strong>"Adicionar à tela inicial"</strong>.
              </Step>
              <Step n={4}>Abra o app pela tela inicial e volte aqui pra ativar avisos.</Step>
            </ol>
          )}
          {tab === "ios" && (
            <ol className="space-y-3 text-sm">
              <Step n={1}>Abra este site no <strong>Safari</strong> (não funciona no Chrome iOS).</Step>
              <Step n={2}>
                Toque no botão <Share className="inline w-4 h-4 mx-0.5" />{" "}
                <strong>Compartilhar</strong> na barra inferior.
              </Step>
              <Step n={3}>
                Role até <strong>"Adicionar à Tela de Início"</strong>{" "}
                <Plus className="inline w-4 h-4 mx-0.5" />.
              </Step>
              <Step n={4}>Toque em <strong>"Adicionar"</strong> no canto superior direito.</Step>
              <Step n={5}>Abra o FastProxy <strong>pela tela inicial</strong> e volte aqui — o botão de ativar vai aparecer.</Step>
              <p className="text-xs text-yellow-500 pt-2 border-t border-border mt-3">
                ⚠️ No iPhone, push só funciona após instalar como app (requisito da
                Apple).
              </p>
            </ol>
          )}
          {tab === "desktop" && (
            <ol className="space-y-3 text-sm">
              <Step n={1}>Use Chrome, Edge ou Firefox.</Step>
              <Step n={2}>
                Procure o ícone de instalar na barra de endereço (parece um monitor
                com seta).
              </Step>
              <Step n={3}>Clique em <strong>Instalar</strong>.</Step>
              <Step n={4}>
                Ou simplesmente ative as notificações no botão acima — não precisa
                instalar no desktop.
              </Step>
            </ol>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div>
        <h2 className="text-lg font-bold mb-3">Histórico</h2>
        {notifs.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificação ainda. Avisos vão aparecer aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) readMut.mutate(n.id);
                  if (n.link) window.location.href = n.link;
                }}
                className={`w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary transition ${
                  !n.read_at ? "border-l-4 border-l-primary" : ""
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{n.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-foreground">{children}</span>
    </li>
  );
}
