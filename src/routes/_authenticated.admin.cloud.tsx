import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCloudUsage, runCloudCleanup } from "@/lib/cloud-usage.functions";
import {
  Cloud, Database, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Loader2, HardDrive, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/cloud")({
  component: AdminCloudPage,
});

function bytesToMB(b: number) {
  return (b / 1024 / 1024).toFixed(2);
}

function AdminCloudPage() {
  const qc = useQueryClient();
  const usageFn = useServerFn(getCloudUsage);
  const cleanupFn = useServerFn(runCloudCleanup);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: () => usageFn(),
    refetchInterval: 30000,
  });

  const [auditDays, setAuditDays] = useState(30);
  const [metricsDays, setMetricsDays] = useState(7);
  const [notificationsDays, setNotificationsDays] = useState(30);
  const [closedChatsDays, setClosedChatsDays] = useState(60);

  const cleanup = useMutation({
    mutationFn: (vars: {
      auditDays: number; metricsDays: number; notificationsDays: number; closedChatsDays: number;
    }) => cleanupFn({ data: { ...vars, analyze: true } }),
    onSuccess: (r) => {
      const res = (r as any)?.result || {};
      const total =
        (res.audit_log_deleted || 0) +
        (res.proxy_metrics_deleted || 0) +
        (res.proxy_health_deleted || 0) +
        (res.notifications_deleted || 0) +
        (res.chat_messages_deleted || 0) +
        (res.chat_conversations_deleted || 0);
      toast.success(`Limpeza concluída — ${total} registros removidos`);
      qc.invalidateQueries({ queryKey: ["cloud-usage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleQuickClean = () => {
    if (!confirm("Executar limpeza com as janelas padrão? Esta ação é irreversível.")) return;
    cleanup.mutate({ auditDays: 30, metricsDays: 7, notificationsDays: 30, closedChatsDays: 60 });
  };
  const handleCustomClean = () => {
    if (!confirm("Executar limpeza com as janelas personalizadas? Esta ação é irreversível.")) return;
    cleanup.mutate({ auditDays, metricsDays, notificationsDays, closedChatsDays });
  };

  const percent = data?.usedPercent ?? 0;
  const usedMB = data ? bytesToMB(data.totalBytes) : "0";
  const limitMB = data ? bytesToMB(data.freeLimitBytes) : "500";
  const status: "ok" | "warn" | "danger" =
    percent < 60 ? "ok" : percent < 85 ? "warn" : "danger";

  const statusColor =
    status === "ok"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : status === "warn"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-red-400 bg-red-500/10 border-red-500/30";

  const barColor =
    status === "ok" ? "bg-emerald-500" : status === "warn" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Cloud className="w-6 h-6 text-primary" /> Saúde do Cloud
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitore o uso do banco e otimize para se manter no plano gratuito (500 MB).
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-2 rounded-lg bg-card border border-border text-sm flex items-center gap-2 hover:bg-foreground/5"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </header>

      {/* Card de uso total */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Banco de dados</div>
              <div className="text-3xl font-black">
                {isLoading ? "—" : `${usedMB} MB`}{" "}
                <span className="text-base font-normal text-muted-foreground">/ {limitMB} MB</span>
              </div>
            </div>
          </div>
          <span className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full border ${statusColor}`}>
            {status === "ok" ? "Tudo certo" : status === "warn" ? "Atenção" : "Crítico"} · {percent.toFixed(1)}%
          </span>
        </div>

        <div className="w-full h-3 rounded-full bg-background overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.max(2, percent)}%` }} />
        </div>

        {status !== "ok" && (
          <div className="flex items-start gap-2 text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Você está usando mais de {percent.toFixed(0)}% do free tier. Recomendo executar a limpeza
              automática abaixo para liberar espaço.
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Limpeza rápida */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-black text-lg">Limpeza rápida</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Aplica as janelas padrão (recomendado para uso semanal): audit 30d, métricas 7d,
            notificações 30d, chats fechados 60d.
          </p>
          <button
            onClick={handleQuickClean}
            disabled={cleanup.isPending}
            className="w-full px-4 py-3 rounded-xl bg-gradient-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {cleanup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Executar limpeza padrão
          </button>
        </div>

        {/* Limpeza personalizada */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-primary" />
            <h2 className="font-black text-lg">Limpeza personalizada</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Audit log (dias)" value={auditDays} onChange={setAuditDays} />
            <NumberField label="Métricas proxy (dias)" value={metricsDays} onChange={setMetricsDays} />
            <NumberField label="Notificações (dias)" value={notificationsDays} onChange={setNotificationsDays} />
            <NumberField label="Chats fechados (dias)" value={closedChatsDays} onChange={setClosedChatsDays} />
          </div>
          <button
            onClick={handleCustomClean}
            disabled={cleanup.isPending}
            className="w-full px-4 py-2 rounded-xl bg-secondary text-secondary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {cleanup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Aplicar janelas personalizadas
          </button>
        </div>
      </div>

      {/* Tabela de tabelas */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h2 className="font-black text-lg">Uso por tabela</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Tabela</th>
                <th className="text-right px-4 py-3">Tamanho</th>
                <th className="text-right px-4 py-3">Linhas</th>
                <th className="text-right px-4 py-3">Linhas mortas</th>
                <th className="text-right px-4 py-3">% do banco</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              )}
              {data?.tables.map((t) => {
                const pct = data.totalBytes > 0 ? (t.bytes / data.totalBytes) * 100 : 0;
                return (
                  <tr key={t.name} className="border-t border-border/60 hover:bg-foreground/5">
                    <td className="px-4 py-2.5 font-mono text-xs">{t.name}</td>
                    <td className="px-4 py-2.5 text-right font-bold">{t.pretty}</td>
                    <td className="px-4 py-2.5 text-right">{t.rows.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right">
                      {t.deadRows > 0 ? (
                        <span className="text-amber-400">{t.deadRows}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dicas */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <h2 className="font-black text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Dicas para se manter no free tier
        </h2>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li><strong className="text-foreground">Rode a limpeza padrão 1x por semana</strong> — mantém o banco enxuto sem perder histórico relevante.</li>
          <li><strong className="text-foreground">audit_log e proxy_metrics</strong> crescem mais rápido. As janelas padrão já cuidam disso.</li>
          <li><strong className="text-foreground">Imagens e arquivos</strong> não usam o banco; se for guardar muita mídia, prefira links externos a base64 em colunas.</li>
          <li><strong className="text-foreground">Não armazene logs verbosos</strong> em tabelas — use console + analytics.</li>
          <li><strong className="text-foreground">Quando passar de 85%</strong>, considere subir o plano (Cloud → Advanced settings → Upgrade instance).</li>
        </ul>
      </div>
    </div>
  );
}

function NumberField({
  label, value, onChange,
}: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</span>
      <input
        type="number"
        min={0}
        max={365}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
        className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-sm"
      />
    </label>
  );
}
