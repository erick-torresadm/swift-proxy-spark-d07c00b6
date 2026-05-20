import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Reply, User } from "lucide-react";
import { toast } from "sonner";
import { listComments, createComment } from "@/lib/blog.functions";
import { useAuth } from "@/hooks/use-auth";

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface CommentNode {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  children: CommentNode[];
}

function buildTree(rows: Omit<CommentNode, "children">[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: CommentNode[] = [];
  byId.forEach((n) => {
    if (n.parent_id && byId.has(n.parent_id)) byId.get(n.parent_id)!.children.push(n);
    else roots.push(n);
  });
  return roots;
}

export function CommentThread({ postId }: { postId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchList = useServerFn(listComments);
  const submitFn = useServerFn(createComment);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["comments", postId],
    queryFn: () => fetchList({ data: { postId } }),
  });

  const tree = buildTree(rows);

  const submit = useMutation({
    mutationFn: (b: string) =>
      submitFn({ data: { postId, body: b, parentId: replyTo ?? undefined } }),
    onSuccess: () => {
      toast.success("Comentário enviado");
      setBody("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["comments", postId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section id="comments" className="mt-12 pt-8 border-t border-border">
      <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
        <MessageSquare className="w-6 h-6 text-primary" />
        Comentários ({rows.length})
      </h2>

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) submit.mutate(body.trim());
          }}
          className="mb-8 bg-card border border-border rounded-2xl p-4"
        >
          {replyTo && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Respondendo a um comentário</span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-primary hover:underline"
              >
                cancelar
              </button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Compartilhe sua experiência…"
            rows={3}
            maxLength={2000}
            className="w-full bg-background border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-primary"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {body.length}/2000
            </span>
            <button
              type="submit"
              disabled={!body.trim() || submit.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition"
            >
              {submit.isPending ? "Enviando…" : "Comentar"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-8 bg-card border border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Entre para deixar um comentário.
          </p>
          <Link
            to="/login"
            className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition"
          >
            Entrar
          </Link>
        </div>
      )}

      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Seja o primeiro a comentar.
        </p>
      ) : (
        <div className="space-y-4">
          {tree.map((c) => (
            <CommentItem key={c.id} c={c} onReply={(id) => setReplyTo(id)} canReply={!!user} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommentItem({
  c,
  onReply,
  canReply,
  depth = 0,
}: {
  c: CommentNode;
  onReply: (id: string) => void;
  canReply: boolean;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-6 sm:ml-10 pl-4 border-l border-border" : ""}>
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center overflow-hidden">
            {c.author_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.author_avatar} alt={c.author_name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="font-semibold text-sm">{c.author_name}</span>
          <span className="text-xs text-muted-foreground">· {timeAgo(c.created_at)}</span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{c.body}</p>
        {canReply && depth === 0 && (
          <button
            onClick={() => onReply(c.id)}
            className="mt-2 text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <Reply className="w-3 h-3" /> Responder
          </button>
        )}
      </div>
      {c.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {c.children.map((child) => (
            <CommentItem
              key={child.id}
              c={child}
              onReply={onReply}
              canReply={canReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
