
-- chat_conversations: explicit DELETE boundaries (defense in depth; admin ALL already applies)
DROP POLICY IF EXISTS "Cliente deleta próprias conversas" ON public.chat_conversations;
CREATE POLICY "Cliente deleta próprias conversas"
ON public.chat_conversations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- post_comments: explicit DELETE for owners (moderators covered by existing ALL policy)
DROP POLICY IF EXISTS "Autor deleta o próprio comentário" ON public.post_comments;
CREATE POLICY "Autor deleta o próprio comentário"
ON public.post_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
