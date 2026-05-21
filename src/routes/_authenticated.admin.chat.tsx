import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminListConversations,
  adminGetMessages,
  adminSendMessage,
  adminCloseConversation,
} from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useChatSound } from "@/hooks/useChatSound";
import {
  MessageCircle, Send, Search, Mail, Phone, Globe, User, Hash, X, Loader2, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/chat")({
  component: AdminChatPage,
});

type Conv = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_ip: string | null;
  subject: string | null;
  status: "waiting" | "active" | "closed";
  last_message_at: string;
  last_message_preview: string | null;
  unread_admin: number;
  profile_name: string | null;
};
type Msg = { id: string; sender: "client" | "admin" | "system"; body: string; created_at: string };

function AdminChatPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListConversations);
  const getMsgsFn = useServerFn(adminGetMessages);
  const sendFn = useServerFn(adminSendMessage);
  const closeFn = useServerFn(adminCloseConversation);
  const { play } = useChatSound();

  const [statusFilter, setStatusFilter] = useState<"all" | "waiting" | "active" | "closed">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTotalRef = useRef(0);
  const lastWaitingRef = useRef(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-chats", statusFilter, search],
    queryFn: () => listFn({ data: { status: statusFilter, search: search || undefined } }),
    refetchInterval: 5000,
  });
  const convs = (data?.conversations ?? []) as Conv[];

  // som para nova conversa / nova mensagem na fila
  useEffect(() => {
    if (!convs.length) {
      lastTotalRef.current = 0;
      lastWaitingRef.current = 0;
      return;
    }
    const totalUnread = convs.reduce((s, c) => s + (c.unread_admin || 0), 0);
    const waiting = convs.filter((c) => c.status === "waiting").length;
    if (waiting > lastWaitingRef.current) play("newChat");
    else if (totalUnread > lastTotalRef.current) play("incoming");
    lastTotalRef.current = totalUnread;
    lastWaitingRef.current = waiting;
  }, [convs, play]);

  // realtime: invalida lista
  const loadMessages = useCallback(
    async (id: string, scroll = true) => {
      try {
        const r = await getMsgsFn({ data: { conversationId: id } });
        setMessages(r.messages as Msg[]);
        if (scroll) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 99999 }));
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [getMsgsFn],
  );

  // realtime: invalida lista
  useEffect(() => {
    const ch = supabase
      .channel("admin-chat-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-chats"] });
        if (selectedId) loadMessages(selectedId, false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-chats"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedId, qc, loadMessages]);

  const selectConv = (id: string) => {
    setSelectedId(id);
    loadMessages(id);
  };


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    const text = reply.trim();
    setReply("");
    const tmp: Msg = { id: `tmp-${Date.now()}`, sender: "admin", body: text, created_at: new Date().toISOString() };
    setMessages((p) => [...p, tmp]);
    play("outgoing");
    try {
      await sendFn({ data: { conversationId: selectedId, body: text } });
      loadMessages(selectedId);
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((p) => p.filter((m) => m.id !== tmp.id));
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    await closeFn({ data: { conversationId: selectedId } });
    toast.success("Conversa fechada");
    qc.invalidateQueries({ queryKey: ["admin-chats"] });
  };

  const selected = useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" /> Chat ao vivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Fila de atendimento em tempo real. Clientes e visitantes em um só lugar.
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "waiting", "active", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Todos" : s === "waiting" ? "Aguardando" : s === "active" ? "Ativos" : "Fechados"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-200px)] min-h-[500px]">
        {/* Lista */}
        <aside className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar id, nome, email, IP..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            )}
            {!isLoading && convs.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">Sem conversas.</p>
            )}
            {convs.map((c) => {
              const name = c.profile_name || c.guest_name || "Visitante";
              const isSel = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => selectConv(c.id)}
                  className={`w-full text-left p-3 border-b border-border/60 hover:bg-foreground/5 transition flex flex-col gap-1 ${
                    isSel ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm truncate">{name}</span>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        c.status === "waiting"
                          ? "bg-amber-500/20 text-amber-400"
                          : c.status === "active"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.status === "waiting" ? "Fila" : c.status === "active" ? "Ativo" : "Fechado"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {c.last_message_preview || "—"}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{new Date(c.last_message_at).toLocaleString("pt-BR")}</span>
                    {c.unread_admin > 0 && (
                      <span className="ml-auto bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                        {c.unread_admin}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Painel */}
        <section className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <header className="p-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-base text-foreground flex items-center gap-2">
                    <User className="w-4 h-4" /> {selected.profile_name || selected.guest_name || "Visitante"}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{selected.id.slice(0, 8)}</span>
                    {selected.guest_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{selected.guest_email}</span>}
                    {selected.guest_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selected.guest_phone}</span>}
                    {selected.guest_ip && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{selected.guest_ip}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground flex items-center gap-1.5 hover:opacity-90"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fechar
                  </button>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-background/40">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                      m.sender === "admin"
                        ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                        : m.sender === "client"
                        ? "mr-auto bg-secondary text-secondary-foreground rounded-bl-sm"
                        : "mx-auto bg-muted text-muted-foreground text-xs"
                    }`}
                  >
                    {m.body}
                    <div className="text-[10px] opacity-60 mt-1">
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2 bg-card">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e as any);
                    }
                  }}
                  placeholder="Responder... (Enter envia, Shift+Enter quebra linha)"
                  rows={2}
                  maxLength={2000}
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm resize-none"
                />
                <button
                  disabled={sending || !reply.trim()}
                  className="px-4 rounded-lg bg-gradient-primary text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
