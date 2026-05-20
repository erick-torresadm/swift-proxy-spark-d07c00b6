-- Push subscriptions per user/device
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  failed_count int NOT NULL DEFAULT 0
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cliente gerencia suas push subs"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);

-- Notification history / queue
CREATE TYPE public.notification_kind AS ENUM (
  'expiring_soon',
  'expired',
  'payment_failed',
  'payment_succeeded',
  'grace_ending',
  'rotation_reset',
  'promo',
  'system'
);

CREATE TYPE public.notification_status AS ENUM ('pending', 'sent', 'failed', 'read');

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.notification_kind NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text,
  metadata jsonb,
  push_status public.notification_status NOT NULL DEFAULT 'pending',
  email_status public.notification_status NOT NULL DEFAULT 'pending',
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (user_id, dedupe_key)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cliente vê próprias notificações"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cliente marca como lida"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin gerencia notificações"
  ON public.notifications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_pending ON public.notifications(push_status, email_status) WHERE push_status='pending' OR email_status='pending';

-- Product flags for auto-renewal at provider and expiry notifications
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS auto_renew_at_provider boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_expiry_days int[] NOT NULL DEFAULT ARRAY[7,3,1];

-- Default: only ISP and IPv4 dedicated auto-renew the same IP at the provider
UPDATE public.products
   SET auto_renew_at_provider = true
 WHERE category IN ('isp', 'ipv4');