CREATE TABLE public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text,
  from_email text,
  reply_to text,
  tags jsonb,
  metadata jsonb,
  priority int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  resend_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_queue_pending ON public.email_queue (priority, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_email_queue_sent_at ON public.email_queue (sent_at) WHERE status = 'sent';
CREATE INDEX idx_email_queue_status ON public.email_queue (status);

GRANT SELECT ON public.email_queue TO authenticated;
GRANT ALL ON public.email_queue TO service_role;

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin vê fila de emails" ON public.email_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_email_queue_updated_at
  BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();