import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Check, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listMyProxies, rotateProxyIp } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard/proxy/$id/quick")({
  component: QuickCopyPage,
  head: () => ({ meta: [{ title: "Proxy — FastProxy" }] }),
});

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem suporte */
  }
}

function CopyRow({
  label,
  value,
  monospace = true,
  reveal = false,
}: {
  label: string;
  value: string | null | undefined;
  monospace?: boolean;
  reveal?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!reveal);
  if (!value) return null;
  const display = shown ? value : "•".repeat(Math.min(value.length, 14));
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        vibrate(25);
        setCopied(true);
        toast.success(`${label} copiado`);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="w-full bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition flex items-center gap-3 min-h-[64px]"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
          {label}
        </p>
        <p className={`truncate text-base ${monospace ? "font-mono" : ""}`}>{display}</p>
      </div>
      {reveal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShown((s) => !s);
          }}
          aria-label={shown ? "Esconder" : "Mostrar"}
          className="p-3 rounded-xl hover:bg-background"
        >
          {shown ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      )}
      <div className="p-3 rounded-xl bg-primary/15 text-primary">
        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
      </div>
    </button>
  );
}

function BigButton({
  label,
  onClick,
  disabled,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      onClick={() => {
        vibrate(15);
        onClick();
      }}
      disabled={disabled}
      className={
        variant === "primary"
          ? "w-full min-h-[56px] rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 disabled:opacity-50 transition"
          : "w-full min-h-[56px] rounded-2xl border border-border font-semibold text-base hover:bg-card disabled:opacity-50 transition"
      }
    >
      {label}
    </button>
  );
}

function QuickCopyPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProxies = useServerFn(listMyProxies);
  const rotateFn = useServerFn(rotateProxyIp);

  const { data, isLoading } = useQuery({
    queryKey: ["my-proxies"],
    queryFn: () => fetchProxies(),
  });

  const proxy = (data ?? []).find((p) => p.id === id);

  const rotate = useMutation({
    mutationFn: () => rotateFn({ data: { proxyId: id } }),
    onSuccess: (r) => {
      toast.success(`IP rotacionado! Restam ${r.remaining}/${r.cap}`);
      qc.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-center text-sm text-muted-foreground py-10">Carregando…</p>;
  }
  if (!proxy) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-muted-foreground mb-4">Proxy não encontrado.</p>
        <Link
          to="/dashboard/proxies"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Ver lista de proxies
        </Link>
      </div>
    );
  }

  const hostPort = `${proxy.host}:${proxy.port}`;
  const httpUrl =
    proxy.username && proxy.password
      ? `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      : `http://${proxy.host}:${proxy.port}`;
  const socks5Url =
    proxy.username && proxy.password
      ? `socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      : `socks5://${proxy.host}:${proxy.port}`;
  const jsonStr = JSON.stringify(
    {
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      protocol: proxy.protocol,
      country: proxy.country_code,
    },
    null,
    2,
  );

  const cap = proxy.ip_rotations_per_month ?? 0;
  const used = proxy.ip_rotations_used ?? 0;
  const remaining = Math.max(0, cap - used);
  const canRotate = cap > 0 && remaining > 0 && proxy.status === "active";

  return (
    <div className="max-w-md mx-auto pb-10">
      <button
        onClick={() => navigate({ to: "/dashboard/proxies" })}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 px-2 py-2 rounded-lg"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-black">{proxy.product_name}</h1>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
          {proxy.protocol} · {proxy.country_code} · {proxy.status}
        </p>
      </div>

      <div className="space-y-3 mb-6">
        <CopyRow label="Host : porta" value={hostPort} />
        <CopyRow label="Usuário" value={proxy.username} />
        <CopyRow label="Senha" value={proxy.password} reveal />
      </div>

      <div className="border-t border-border/60 my-6" />

      <div className="space-y-3">
        <BigButton
          label="📋 Copiar URL HTTP"
          onClick={() => {
            navigator.clipboard.writeText(httpUrl);
            toast.success("URL HTTP copiada");
          }}
        />
        <BigButton
          label="📋 Copiar URL SOCKS5"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(socks5Url);
            toast.success("URL SOCKS5 copiada");
          }}
        />
        <BigButton
          label="📋 Copiar JSON"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(jsonStr);
            toast.success("JSON copiado");
          }}
        />
        {cap > 0 && (
          <button
            onClick={() => {
              vibrate(15);
              rotate.mutate();
            }}
            disabled={!canRotate || rotate.isPending}
            className="w-full min-h-[56px] rounded-2xl border border-primary/30 bg-primary/5 text-primary font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/10 disabled:opacity-40 transition"
          >
            <RefreshCw className={`w-5 h-5 ${rotate.isPending ? "animate-spin" : ""}`} />
            Rotacionar IP ({remaining}/{cap})
          </button>
        )}
      </div>
    </div>
  );
}
