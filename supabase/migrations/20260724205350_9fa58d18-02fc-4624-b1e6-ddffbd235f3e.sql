
INSERT INTO public.provider_settings (provider, dry_run, auto_purchase_enabled, source_mode)
VALUES ('fastproxy_vps_users', true, false, 'stock')
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vps_user_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  block_id text,
  host text NOT NULL DEFAULT '104.234.186.95',
  port_start integer NOT NULL DEFAULT 30000,
  port_end integer NOT NULL DEFAULT 30499,
  status text NOT NULL DEFAULT 'active',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vps_user_bindings TO authenticated;
GRANT ALL ON public.vps_user_bindings TO service_role;

ALTER TABLE public.vps_user_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia bindings" ON public.vps_user_bindings
  FOR ALL USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cliente vê próprio binding" ON public.vps_user_bindings
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vps_user_bindings_order ON public.vps_user_bindings(order_id);
CREATE INDEX IF NOT EXISTS idx_vps_user_bindings_user  ON public.vps_user_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_vps_user_bindings_status ON public.vps_user_bindings(status);

CREATE TRIGGER trg_vps_user_bindings_updated_at
  BEFORE UPDATE ON public.vps_user_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
