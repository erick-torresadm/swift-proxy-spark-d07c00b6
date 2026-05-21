
CREATE OR REPLACE FUNCTION public.increment_coupon_uses(_coupon_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.coupons SET uses_count = uses_count + 1 WHERE id = _coupon_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_coupon_uses(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_uses(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_uses(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_uses(uuid) TO service_role;
