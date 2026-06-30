
ALTER TABLE public.dunning_emails
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'auto';

CREATE INDEX IF NOT EXISTS idx_dunning_emails_email ON public.dunning_emails(lower(email));
CREATE INDEX IF NOT EXISTS idx_dunning_emails_resend ON public.dunning_emails(resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dunning_emails_sent_at ON public.dunning_emails(sent_at DESC);
