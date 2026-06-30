ALTER TABLE public.dunning_emails ADD COLUMN IF NOT EXISTS queue_id uuid;
CREATE INDEX IF NOT EXISTS idx_dunning_emails_queue_id ON public.dunning_emails (queue_id) WHERE queue_id IS NOT NULL;