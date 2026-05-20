
-- ENUMS
CREATE TYPE public.product_category AS ENUM ('ipv6', 'ipv6_fb', 'ipv4', 'isp');
CREATE TYPE public.delivery_mode AS ENUM ('stock', 'direct');
CREATE TYPE public.stock_status AS ENUM ('available', 'allocated', 'expired', 'removed');
CREATE TYPE public.allocation_status AS ENUM ('active', 'grace', 'released', 'cancelled');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'past_due', 'grace', 'cancelled', 'expired');
CREATE TYPE public.provider_order_status AS ENUM ('pending', 'active', 'expired', 'failed');

-- PRODUCTS (public catalog)
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category product_category NOT NULL,
  country_code text NOT NULL DEFAULT 'BR',
  duration_days int NOT NULL DEFAULT 30,
  price_monthly_cents int NOT NULL,
  price_yearly_cents int,
  delivery_mode delivery_mode NOT NULL,
  block_size int NOT NULL DEFAULT 1,                 -- IPv6 = 10
  ip_rotations_per_month int NOT NULL DEFAULT 0,     -- IPv6 FB = 10
  provider_tariff_id text,                           -- id da tarifa na Proxy-Seller
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PROVIDER ORDERS (lote comprado no fornecedor)
CREATE TABLE public.provider_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  external_order_id text UNIQUE,
  status provider_order_status NOT NULL DEFAULT 'pending',
  quantity int NOT NULL,
  cost_cents int,
  country_code text,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT true,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PROXY STOCK (cada IP individual de um bloco IPv6)
CREATE TABLE public.proxy_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  provider_order_id uuid REFERENCES public.provider_orders(id),
  external_proxy_id text,
  host text NOT NULL,
  port int NOT NULL,
  username text,
  password text,
  protocol text DEFAULT 'http',
  country_code text,
  status stock_status NOT NULL DEFAULT 'available',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proxy_stock_avail ON public.proxy_stock(product_id, status) WHERE status = 'available';

-- ORDERS (pedido do cliente, vinculado ao Stripe)
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity int NOT NULL DEFAULT 1,
  billing_cycle text NOT NULL DEFAULT 'monthly',     -- 'monthly' | 'yearly'
  amount_cents int NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  current_period_end timestamptz,
  grace_until timestamptz,                           -- 7 dias depois de past_due
  last_payment_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- CUSTOMER PROXIES (alocação)
CREATE TABLE public.customer_proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stock_id uuid REFERENCES public.proxy_stock(id),           -- IPv6
  provider_order_id uuid REFERENCES public.provider_orders(id), -- IPv4/ISP
  status allocation_status NOT NULL DEFAULT 'active',
  ip_rotations_used int NOT NULL DEFAULT 0,
  rotations_reset_at timestamptz NOT NULL DEFAULT now(),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_proxies_user ON public.customer_proxies(user_id);
CREATE UNIQUE INDEX idx_customer_proxies_stock_active
  ON public.customer_proxies(stock_id) WHERE status IN ('active','grace');

-- RESTOCK RULES
CREATE TABLE public.restock_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid UNIQUE NOT NULL REFERENCES public.products(id),
  min_stock int NOT NULL DEFAULT 0,
  batch_quantity int NOT NULL DEFAULT 10,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  source text NOT NULL,        -- 'proxy_seller' | 'stripe' | 'system'
  action text NOT NULL,
  status text,
  request jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

-- TIMESTAMP TRIGGERS
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER proxy_stock_updated BEFORE UPDATE ON public.proxy_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER customer_proxies_updated BEFORE UPDATE ON public.customer_proxies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER restock_rules_updated BEFORE UPDATE ON public.restock_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Products: catálogo público
CREATE POLICY "Catálogo público" ON public.products FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin gerencia produtos" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Proxy stock: só admin
CREATE POLICY "Admin gerencia estoque" ON public.proxy_stock FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Provider orders: só admin
CREATE POLICY "Admin vê provedor" ON public.provider_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Orders: cliente vê os próprios, admin vê tudo
CREATE POLICY "Cliente vê pedidos próprios" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin gerencia pedidos" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Customer proxies
CREATE POLICY "Cliente vê próprios proxies" ON public.customer_proxies FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin gerencia alocações" ON public.customer_proxies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Restock rules: só admin
CREATE POLICY "Admin regras reposição" ON public.restock_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Audit log: só admin lê
CREATE POLICY "Admin lê auditoria" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- handle_new_user atualizado: auto-admin para o email do fundador
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  IF lower(NEW.email) = 'ericktorresadm@hotmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- garantir trigger em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função: liberar proxies de pedidos cuja carência expirou
CREATE OR REPLACE FUNCTION public.release_expired_grace_proxies()
RETURNS TABLE(released_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- Marca alocações como liberadas quando o pedido está em grace expirada
  WITH expired AS (
    SELECT cp.id, cp.stock_id
    FROM public.customer_proxies cp
    JOIN public.orders o ON o.id = cp.order_id
    WHERE cp.status IN ('grace','active')
      AND o.status IN ('past_due','grace')
      AND o.grace_until IS NOT NULL
      AND o.grace_until < now()
  ), upd AS (
    UPDATE public.customer_proxies
       SET status='released', released_at=now()
     WHERE id IN (SELECT id FROM expired)
    RETURNING stock_id
  )
  UPDATE public.proxy_stock
     SET status='available'
   WHERE id IN (SELECT stock_id FROM upd) AND status='allocated';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

-- Inserir catálogo inicial
INSERT INTO public.products (slug,name,description,category,country_code,duration_days,price_monthly_cents,price_yearly_cents,delivery_mode,block_size,ip_rotations_per_month)
VALUES
  ('ipv6-br','IPv6 Brasil','IPv6 dedicado para automação geral','ipv6','BR',30, 3000, 29700, 'stock', 10, 0),
  ('ipv6-fb-br','IPv6 Facebook Ads','IPv6 com 10 trocas de IP/mês para Ads','ipv6_fb','BR',30, 8000, 79200, 'stock', 10, 10),
  ('ipv4-us','IPv4 Dedicado EUA','IPv4 com usuário/senha','ipv4','US',30, 12000, 118800, 'direct', 1, 0),
  ('isp-us','ISP Residencial EUA','IP residencial premium','isp','US',30, 18000, 178200, 'direct', 1, 0);
