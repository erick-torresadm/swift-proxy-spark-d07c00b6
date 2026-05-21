
-- Coupons table
CREATE TYPE public.coupon_kind AS ENUM ('percent', 'fixed');

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  kind public.coupon_kind NOT NULL,
  value_pct numeric,           -- when kind='percent' (0-100)
  value_cents integer,         -- when kind='fixed' (BRL cents)
  min_amount_cents integer NOT NULL DEFAULT 0,
  max_uses integer,            -- null = unlimited
  uses_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,     -- null = no expiry
  stripe_coupon_id text,       -- created lazily on Stripe when used
  applies_to_billing text NOT NULL DEFAULT 'any', -- 'monthly' | 'yearly' | 'any'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupons_code_lower ON public.coupons (lower(code));

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia cupons" ON public.coupons
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_coupon_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'percent' AND (NEW.value_pct IS NULL OR NEW.value_pct <= 0 OR NEW.value_pct > 100) THEN
    RAISE EXCEPTION 'value_pct deve estar entre 0 e 100';
  END IF;
  IF NEW.kind = 'fixed' AND (NEW.value_cents IS NULL OR NEW.value_cents <= 0) THEN
    RAISE EXCEPTION 'value_cents deve ser positivo';
  END IF;
  IF NEW.valid_until IS NOT NULL AND NEW.valid_until <= NEW.valid_from THEN
    RAISE EXCEPTION 'valid_until deve ser maior que valid_from';
  END IF;
  NEW.code := upper(NEW.code);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER coupons_validate BEFORE INSERT OR UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.validate_coupon_row();

-- Redemptions
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL,
  order_id uuid,
  user_id uuid,
  customer_email text,
  amount_cents_before integer NOT NULL,
  discount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_redemptions_coupon ON public.coupon_redemptions (coupon_id);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lê redemptions" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Public validation function (SECURITY DEFINER so it can read coupons without RLS issue)
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code text,
  _amount_cents integer,
  _billing text DEFAULT 'monthly'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  v_discount integer := 0;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE code = upper(trim(_code)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom não encontrado');
  END IF;
  IF NOT c.active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom inativo');
  END IF;
  IF c.valid_from > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom ainda não está ativo');
  END IF;
  IF c.valid_until IS NOT NULL AND c.valid_until < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom expirado');
  END IF;
  IF c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Cupom esgotado');
  END IF;
  IF _amount_cents < c.min_amount_cents THEN
    RETURN jsonb_build_object('valid', false, 'reason',
      'Pedido mínimo de R$ ' || to_char(c.min_amount_cents::numeric/100, 'FM999G999D00'));
  END IF;
  IF c.applies_to_billing <> 'any' AND c.applies_to_billing <> _billing THEN
    RETURN jsonb_build_object('valid', false, 'reason',
      'Cupom válido apenas para ciclo ' || c.applies_to_billing);
  END IF;

  IF c.kind = 'percent' THEN
    v_discount := floor(_amount_cents * c.value_pct / 100);
  ELSE
    v_discount := LEAST(c.value_cents, _amount_cents);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'code', c.code,
    'kind', c.kind,
    'value_pct', c.value_pct,
    'value_cents', c.value_cents,
    'discount_cents', v_discount,
    'description', c.description
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(text, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, integer, text) TO service_role;
