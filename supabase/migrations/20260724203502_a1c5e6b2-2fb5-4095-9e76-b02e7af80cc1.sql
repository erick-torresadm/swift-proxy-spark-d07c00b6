DROP POLICY IF EXISTS "Cliente atualiza próprias conversas" ON public.chat_conversations;
CREATE POLICY "Cliente atualiza próprias conversas"
ON public.chat_conversations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND assigned_admin_id IS NOT DISTINCT FROM assigned_admin_id);