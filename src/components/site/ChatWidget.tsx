import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase-custom/client";
import {
  startConversation,
  guestSendMessage,
  guestGetMessages,
  clientSendMessage,
  clientMarkRead,
  clientListMyConversation,
} from "@/lib/chat.functions";
import { useChatSound } from "@/hooks/useChatSound";
import { toast } from "sonner";

type Msg = { id: string; sender: "client" | "admin" | "system"; body: string; created_at: string };

const GUEST_KEY = "fp_chat_guest";

function loadGuest(): { token: string; conversationId: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveGuest(v: { token: string; conversationId: string }) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(v));
}

export function ChatWidget() {
  const location = useLocation();
  if (location.pathname.startsWith("/admin")) return null;
  return <ChatWidgetInner />;
}

function ChatWidgetInner() {
  const [open, setOpen] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "" });
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { play } = useChatSound();

  const startFn = useServerFn(startConversation);
  const guestSendFn = useServerFn(guestSendMessage);
  const guestPollFn = useServerFn(guestGetMessages);
  const clientSendFn = useServerFn(clientSendMessage);
  const clientMarkReadFn = useServerFn(clientMarkRead);
  const clientListFn = useServerFn(clientListMyConversation);

  // auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAuthUser({ id: data.user.id, email: data.user.email ?? null });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setAuthUser(sess?.user ? { id: sess.user.id, email: sess.user.email ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Hydrate from storage / server
  useEffect(() => {
    if (authUser) {
      clientListFn().then((r) => {
        if (r.conversation) {
          setConversationId(r.conversation.id);
          setMessages(r.messages as Msg[]);
        }
      }).catch(() => {});
    } else {
      const g = loadGuest();
      if (g) {
        setGuestToken(g.token);
        setConversationId(g.conversationId);
      }
    }
  }, [authUser, clientListFn]);

  // Realtime para autenticado
  useEffect(() => {
    if (!conversationId || !authUser) return;
    const ch = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          if (m.sender === "admin") {
            play("incoming");
            if (!open) setUnread((u) => u + 1);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, authUser, open, play]);

  // Polling para guest
  useEffect(() => {
    if (!conversationId || !guestToken || authUser) return;
    let active = true;
    const tick = async () => {
      try {
        const r = await guestPollFn({ data: { conversationId, guestToken } });
        if (!active) return;
        setMessages((prev) => {
          const newOnes = (r.messages as Msg[]).filter((m) => !prev.some((p) => p.id === m.id));
          if (newOnes.some((m) => m.sender === "admin")) {
            play("incoming");
            if (!open) setUnread((u) => u + newOnes.filter((m) => m.sender === "admin").length);
          }
          return r.messages as Msg[];
        });
      } catch {}
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [conversationId, guestToken, authUser, guestPollFn, open, play]);

  // Auto-scroll + marca lido
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (open) {
      setUnread(0);
      if (authUser && conversationId) clientMarkReadFn({ data: { conversationId } }).catch(() => {});
    }
  }, [open, authUser, conversationId, clientMarkReadFn]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !body.trim()) {
      toast.error("Preencha nome e mensagem");
      return;
    }
    setSending(true);
    try {
      const r = await startFn({
        data: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          subject: form.subject,
          message: body,
        },
      });
      setConversationId(r.conversationId);
      if (r.guestToken) {
        setGuestToken(r.guestToken);
        saveGuest({ token: r.guestToken, conversationId: r.conversationId });
      }
      setBody("");
      play("outgoing");
      toast.success("Mensagem enviada! Aguardando atendente...");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const text = body.trim();
    setBody("");
    // optimistic
    const tmp: Msg = { id: `tmp-${Date.now()}`, sender: "client", body: text, created_at: new Date().toISOString() };
    setMessages((p) => [...p, tmp]);
    play("outgoing");
    try {
      if (authUser && !conversationId) {
        // primeira mensagem do cliente autenticado — cria a conversa
        const r = await startFn({
          data: {
            name: authUser.email?.split("@")[0] || "Cliente",
            email: authUser.email ?? "",
            phone: "",
            subject: "",
            message: text,
            userId: authUser.id,
          },
        });
        setConversationId(r.conversationId);
      } else if (authUser && conversationId) {
        await clientSendFn({ data: { conversationId, body: text } });
      } else if (guestToken && conversationId) {
        await guestSendFn({ data: { conversationId, guestToken, body: text } });
      }
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((p) => p.filter((m) => m.id !== tmp.id));
    } finally {
      setSending(false);
    }
  };

  const needsForm = !conversationId && !authUser;

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir chat"
        className="fixed bottom-5 right-5 z-50 size-14 rounded-full bg-gradient-primary text-primary-foreground shadow-elegant flex items-center justify-center hover:scale-105 active:scale-95 transition"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center animate-pulse">
            {unread}
          </span>
        )}
      </button>

      {/* Janela */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-8rem))] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          <header className="px-4 py-3 bg-gradient-primary text-primary-foreground">
            <div className="font-bold text-sm">Atendimento FastProxy</div>
            <div className="text-[11px] opacity-80">Resposta em minutos · seg-sex 9h-19h</div>
          </header>

          {needsForm ? (
            <form onSubmit={handleStart} className="flex-1 flex flex-col p-4 gap-2.5 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">
                Como podemos te ajudar? Preencha seus dados para começarmos.
              </p>
              <input
                required maxLength={80}
                placeholder="Seu nome *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
              <input
                type="email" maxLength={160}
                placeholder="Email (opcional)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
              <input
                maxLength={40}
                placeholder="WhatsApp (opcional)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm"
              />
              <textarea
                required maxLength={2000}
                rows={4}
                placeholder="Sua mensagem *"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm resize-none"
              />
              <button
                disabled={sending}
                className="mt-1 w-full py-2.5 rounded-lg bg-gradient-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar mensagem
              </button>
            </form>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-background/40">
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center">Sem mensagens ainda.</p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                      m.sender === "client"
                        ? "ml-auto bg-primary text-primary-foreground rounded-br-sm"
                        : m.sender === "admin"
                        ? "mr-auto bg-secondary text-secondary-foreground rounded-bl-sm"
                        : "mx-auto bg-muted text-muted-foreground text-xs"
                    }`}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2 bg-card">
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escreva uma mensagem..."
                  maxLength={2000}
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm"
                />
                <button
                  disabled={sending || !body.trim()}
                  className="size-10 rounded-lg bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                  aria-label="Enviar"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
