CREATE POLICY "Cliente cria próprias conversas"
ON public.chat_conversations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);