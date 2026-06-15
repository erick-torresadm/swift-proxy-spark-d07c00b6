CREATE TABLE public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now(),
  customer_email text,
  customer_id text,
  subscription_id text,
  invoice_id text,
  charge_id text,
  payment_intent_id text,
  session_id text,
  order_id uuid,
  amount_cents integer,
  currency text,
  status text,
  reason text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_events TO authenticated;
GRANT ALL ON public.stripe_events TO service_role;

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read stripe events"
  ON public.stripe_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX stripe_events_occurred_at_idx ON public.stripe_events (occurred_at DESC);
CREATE INDEX stripe_events_type_idx ON public.stripe_events (type);
CREATE INDEX stripe_events_order_id_idx ON public.stripe_events (order_id);
CREATE INDEX stripe_events_subscription_id_idx ON public.stripe_events (subscription_id);

ALTER TABLE public.stripe_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stripe_events;