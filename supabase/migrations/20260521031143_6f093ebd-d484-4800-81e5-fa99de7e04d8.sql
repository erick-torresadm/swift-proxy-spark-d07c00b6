
CREATE OR REPLACE FUNCTION public.validate_coupon_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, integer, text) TO service_role;
