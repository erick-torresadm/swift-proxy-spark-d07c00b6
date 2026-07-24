
-- Fix: chat_conversations assigned_admin_id tautology
DROP POLICY IF EXISTS "Cliente atualiza próprias conversas" ON public.chat_conversations;
CREATE POLICY "Cliente atualiza próprias conversas" ON public.chat_conversations
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.enforce_chat_conversation_client_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF app_private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id THEN
    RAISE EXCEPTION 'Não é permitido alterar assigned_admin_id';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido alterar user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_conversations_client_immutable ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_client_immutable
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_conversation_client_immutable();

-- Fix: post_comments author status reset
DROP POLICY IF EXISTS "Autor edita o próprio" ON public.post_comments;
CREATE POLICY "Autor edita o próprio" ON public.post_comments
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.enforce_post_comments_author_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF can_moderate_comments(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Somente moderadores podem alterar o status do comentário';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comments_author_status ON public.post_comments;
CREATE TRIGGER trg_post_comments_author_status
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_comments_author_status();
