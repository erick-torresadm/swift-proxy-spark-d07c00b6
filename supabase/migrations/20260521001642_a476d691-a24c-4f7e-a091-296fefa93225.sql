
CREATE TYPE chat_status AS ENUM ('waiting', 'active', 'closed');
CREATE TYPE chat_sender AS ENUM ('client', 'admin', 'system');

CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  guest_token text,
  guest_name text,
  guest_email text,
  guest_phone text,
  guest_ip text,
  subject text,
  status chat_status NOT NULL DEFAULT 'waiting',
  assigned_admin_id uuid,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_admin int NOT NULL DEFAULT 0,
  unread_client int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conv_status ON public.chat_conversations(status, last_message_at DESC);
CREATE INDEX idx_chat_conv_user ON public.chat_conversations(user_id);
CREATE INDEX idx_chat_conv_token ON public.chat_conversations(guest_token);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender chat_sender NOT NULL,
  sender_user_id uuid,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_msg_conv ON public.chat_messages(conversation_id, created_at);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Conversations
CREATE POLICY "Admin gerencia conversas"
ON public.chat_conversations FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cliente vê próprias conversas"
ON public.chat_conversations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Cliente atualiza próprias conversas"
ON public.chat_conversations FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- Messages
CREATE POLICY "Admin gerencia mensagens"
ON public.chat_messages FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cliente vê mensagens das próprias conversas"
ON public.chat_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.chat_conversations c
  WHERE c.id = conversation_id AND c.user_id = auth.uid()
));

CREATE POLICY "Cliente insere mensagens nas próprias conversas"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  sender = 'client'::chat_sender
  AND sender_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  )
);

-- Trigger updated_at
CREATE TRIGGER chat_conv_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: ao inserir mensagem, atualiza conversa
CREATE OR REPLACE FUNCTION public.chat_on_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = left(NEW.body, 140),
      unread_admin = CASE WHEN NEW.sender = 'client' THEN unread_admin + 1 ELSE unread_admin END,
      unread_client = CASE WHEN NEW.sender = 'admin' THEN unread_client + 1 ELSE unread_client END,
      status = CASE
        WHEN NEW.sender = 'client' AND status = 'closed' THEN 'waiting'::chat_status
        WHEN NEW.sender = 'admin' AND status = 'waiting' THEN 'active'::chat_status
        ELSE status
      END,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_msg_after_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.chat_on_new_message();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
