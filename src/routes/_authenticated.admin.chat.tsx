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
import { supabase } from "@/lib/supabase-custom/client";
import { useChatSound } from "@/hooks/useChatSound";
import { CANNED_MESSAGES } from "@/lib/chat-canned";
import {
  MessageCircle, Send, Search, Mail, Phone, Globe, User, Hash, Loader2, CheckCircle2,
  Volume2, VolumeX, Bell, BellOff, Copy, BookOpen, ChevronDown, Smile,
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

const EMOJIS = ["👍", "🙏", "🚀", "✅", "🔥", "💡", "⚠️", "❤️", "😉", "🤝", "📌", "⏳"];

function AdminChatPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListConversations);
  const getMsgsFn = useServerFn(adminGetMessages);
  const sendFn = useServerFn(adminSendMessage);
  const closeFn = useServerFn(adminCloseConversation);
  const { play, muted, toggleMuted } = useChatSound();

  const [statusFilter, setStatusFilter] = useState<"all" | "waiting" | "active" | "closed">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const [notifEnabled, setNotifEnabled] = useState<boolean>(
    typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted",
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTotalRef = useRef(0);
  const lastWaitingRef = useRef(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-chats", statusFilter, search],
    queryFn: () => listFn({ data: { status: statusFilter, search: search || undefined } }),
    refetchInterval: 5000,
  });
  const convs = (data?.conversations ?? []) as Conv[];

  const totalUnread = useMemo(
    () => convs.reduce((s, c) => s + (c.unread_admin || 0), 0),
    [convs],
  );

  // som + notificação para nova conversa / nova mensagem
  useEffect(() => {
    if (!convs.length) {
      lastTotalRef.current = 0;
      lastWaitingRef.current = 0;
      return;
    }
    const waiting = convs.filter((c) => c.status === "waiting").length;
    if (waiting > lastWaitingRef.current) {
      play("newChat");
      notify("Nova conversa na fila", `${waiting} aguardando atendimento`);
    } else if (totalUnread > lastTotalRef.current) {
      play("incoming");
      const c = convs.find((x) => x.unread_admin > 0);
      if (c) notify(
        c.profile_name || c.guest_name || "Nova mensagem",
        c.last_message_preview || "Nova mensagem recebida",
      );
    }
    lastTotalRef.current = totalUnread;
    lastWaitingRef.current = waiting;
  }, [convs, play, totalUnread]);

  // Badge no título da aba
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = "Chat ao vivo";
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread]);

  const notify = (title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      new Notification(title, { body, icon: "/favicon.ico", tag: "chat" });
    } catch {}
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("Seu navegador não suporta notificações");
      return;
    }
    const p = await Notification.requestPermission();
    setNotifEnabled(p === "granted");
    if (p === "granted") toast.success("Notificações ativadas");
  };

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
    setMsgSearch("");
    loadMessages(id);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const insertText = (txt: string) => {
    setReply((prev) => (prev ? `${prev}${prev.endsWith("\n") || prev.endsWith(" ") ? "" : " "}${txt}` : txt));
    textareaRef.current?.focus();
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    const text = reply.trim();
    setReply("");
    const tmp: Msg = { id: `tmp-${Date.now()}`, sender: "admin", body: text, created_at: new Date().toISOString() };
    setMessages((p) => [...p, tmp]);
    play("outgoing");
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 99999 }));
    try {
      await sendFn({ data: { conversationId: selectedId, body: text } });
      loadMessages(selectedId);
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((p) => p.filter((m) => m.id !== tmp.id));
      setReply(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    if (!confirm("Fechar esta conversa?")) return;
    await closeFn({ data: { conversationId: selectedId } });
    toast.success("Conversa fechada");
    qc.invalidateQueries({ queryKey: ["admin-chats"] });
  };

  const copyMsg = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Mensagem copiada");
  };

  const selected = useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);

  const filteredMsgs = useMemo(() => {
    if (!msgSearch.trim()) return messages;
    const q = msgSearch.toLowerCase();
    return messages.filter((m) => m.body.toLowerCase().includes(q));
  }, [messages, msgSearch]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" /> Chat ao vivo
            {totalUnread > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {totalUnread}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fila de atendimento em tempo real. Clientes e visitantes em um só lugar.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={toggleMuted}
            title={muted ? "Ativar som" : "Silenciar som"}
            className="p-2 rounded-lg bg-card border border-border hover:text-foreground text-muted-foreground"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={requestNotifications}
            title={notifEnabled ? "Notificações ativas" : "Ativar notificações desktop"}
            className={`p-2 rounded-lg border ${
              notifEnabled
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
          <div className="flex gap-1">
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
        <section className="bg-card border border-border rounded-xl flex flex-col overflow-hidden relative">
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
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selected.id);
                          toast.success("ID copiado");
                        }}
                        className="hover:text-foreground"
                        title="Copiar ID"
                      >
                        {selected.id.slice(0, 8)}
                      </button>
                    </span>
                    {selected.guest_email && (
                      <a href={`mailto:${selected.guest_email}`} className="flex items-center gap-1 hover:text-foreground">
                        <Mail className="w-3 h-3" />{selected.guest_email}
                      </a>
                    )}
                    {selected.guest_phone && (
                      <a href={`https://wa.me/${selected.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
                        <Phone className="w-3 h-3" />{selected.guest_phone}
                      </a>
                    )}
                    {selected.guest_ip && (
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{selected.guest_ip}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={msgSearch}
                      onChange={(e) => setMsgSearch(e.target.value)}
                      placeholder="Buscar no chat..."
                      className="pl-7 pr-2 py-1.5 rounded-lg bg-background border border-border text-xs w-40"
                    />
                  </div>
                  <button
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground flex items-center gap-1.5 hover:opacity-90"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fechar
                  </button>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-background/40">
                {filteredMsgs.length === 0 && msgSearch && (
                  <p className="text-center text-xs text-muted-foreground py-8">Nenhuma mensagem encontrada.</p>
                )}
                {filteredMsgs.map((m) => (
                  <div
                    key={m.id}
                    className={`group max-w-[70%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap relative ${
                      m.sender === "admin"
                        ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                        : m.sender === "client"
                        ? "mr-auto bg-secondary text-secondary-foreground rounded-bl-sm"
                        : "mx-auto bg-muted text-muted-foreground text-xs"
                    }`}
                  >
                    {m.body}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="text-[10px] opacity-60">
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <button
                        onClick={() => copyMsg(m.body)}
                        className="opacity-0 group-hover:opacity-70 hover:opacity-100 transition"
                        title="Copiar"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Toolbar acima do composer */}
              <div className="border-t border-border bg-card/80 px-3 pt-2 flex items-center gap-1 flex-wrap relative">
                <button
                  type="button"
                  onClick={() => { setCannedOpen((v) => !v); setEmojiOpen(false); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 font-bold flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" /> Respostas prontas
                  <ChevronDown className={`w-3 h-3 transition ${cannedOpen ? "rotate-180" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => { setEmojiOpen((v) => !v); setCannedOpen(false); }}
                  className="text-xs px-2 py-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground"
                  title="Emojis"
                >
                  <Smile className="w-4 h-4" />
                </button>
                <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">
                  Enter envia · Shift+Enter quebra linha · Ctrl+/ respostas
                </span>

                {cannedOpen && (
                  <div className="absolute bottom-full left-3 mb-2 w-[min(560px,calc(100%-1.5rem))] max-h-[60vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl z-20 p-3 space-y-3">
                    {CANNED_MESSAGES.map((cat) => (
                      <div key={cat.label}>
                        <div className="text-[10px] font-black uppercase text-muted-foreground mb-1.5 tracking-wider">
                          {cat.label}
                        </div>
                        <div className="grid gap-1">
                          {cat.items.map((it) => (
                            <button
                              key={it.title}
                              type="button"
                              onClick={() => {
                                setReply(it.body);
                                setCannedOpen(false);
                                textareaRef.current?.focus();
                              }}
                              className="text-left p-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/30 transition"
                            >
                              <div className="text-xs font-bold text-foreground">{it.title}</div>
                              <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                {it.body}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {emojiOpen && (
                  <div className="absolute bottom-full left-3 mb-2 bg-card border border-border rounded-xl shadow-2xl z-20 p-2 flex flex-wrap gap-1 max-w-[280px]">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { insertText(e); setEmojiOpen(false); }}
                        className="text-xl p-1.5 hover:bg-primary/10 rounded-lg"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2 bg-card">
                <textarea
                  ref={textareaRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    } else if ((e.ctrlKey || e.metaKey) && e.key === "/") {
                      e.preventDefault();
                      setCannedOpen((v) => !v);
                    }
                  }}
                  placeholder="Responder... (Enter envia · Shift+Enter quebra linha · Ctrl+/ respostas prontas)"
                  rows={2}
                  maxLength={2000}
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm resize-none"
                />
                <div className="flex flex-col gap-1">
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="px-4 py-2 rounded-lg bg-gradient-primary text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-50 flex-1"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                  <div className="text-[9px] text-muted-foreground text-center">
                    {reply.length}/2000
                  </div>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
