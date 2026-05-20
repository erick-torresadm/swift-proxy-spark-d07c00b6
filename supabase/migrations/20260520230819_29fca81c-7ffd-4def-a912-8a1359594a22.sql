
-- pricing_rules: markup configurável por produto
CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  markup_pct numeric(6,2) NOT NULL DEFAULT 100,
  min_margin_pct numeric(6,2) NOT NULL DEFAULT 30,
  auto_sync_stripe boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia pricing_rules" ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_pricing_rules_updated BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fx_rates: cotação USD→BRL cache
CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL,
  rate_brl numeric(12,4) NOT NULL,
  source text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fx_rates_currency_time ON public.fx_rates (currency, fetched_at DESC);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lê fx_rates" ON public.fx_rates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- provider_balance_snapshots: histórico de saldo ProxySeller
CREATE TABLE public.provider_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'proxyseller',
  balance_usd numeric(12,2) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_balance_snap_time ON public.provider_balance_snapshots (provider, fetched_at DESC);
ALTER TABLE public.provider_balance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lê balance snapshots" ON public.provider_balance_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- proxy_health_events: detecções de IPs expirando/bloqueados
CREATE TABLE public.proxy_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid,
  external_proxy_id text,
  event text NOT NULL, -- 'expiring_soon' | 'expired' | 'blocked' | 'replaced'
  details jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_health_unresolved ON public.proxy_health_events (resolved_at) WHERE resolved_at IS NULL;
ALTER TABLE public.proxy_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lê health events" ON public.proxy_health_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- provider_settings: config global (saldo mínimo, alertas, etc.)
CREATE TABLE public.provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE DEFAULT 'proxyseller',
  min_balance_usd numeric(12,2) NOT NULL DEFAULT 50,
  alert_email text,
  auto_purchase_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia provider_settings" ON public.provider_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_provider_settings_updated BEFORE UPDATE ON public.provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: default settings + pricing_rules para produtos existentes
INSERT INTO public.provider_settings (provider, min_balance_usd, auto_purchase_enabled)
  VALUES ('proxyseller', 50, true)
  ON CONFLICT (provider) DO NOTHING;

INSERT INTO public.pricing_rules (product_id, markup_pct, min_margin_pct)
SELECT id, 100, 30 FROM public.products
ON CONFLICT (product_id) DO NOTHING;
