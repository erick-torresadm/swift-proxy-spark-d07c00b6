
CREATE TABLE IF NOT EXISTS public.dunning_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  campaign text NOT NULL,
  stage text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  email text,
  resend_id text,
  UNIQUE (order_id, campaign, stage)
);

GRANT SELECT ON public.dunning_emails TO authenticated;
GRANT ALL ON public.dunning_emails TO service_role;

ALTER TABLE public.dunning_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read dunning_emails"
  ON public.dunning_emails FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_dunning_emails_order ON public.dunning_emails(order_id);
CREATE INDEX IF NOT EXISTS idx_dunning_emails_user ON public.dunning_emails(user_id);
