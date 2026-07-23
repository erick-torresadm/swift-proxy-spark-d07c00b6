CREATE OR REPLACE FUNCTION public.release_expired_grace_proxies()
RETURNS TABLE(released_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_released int := 0;
  v_hidden int := 0;
BEGIN
  -- IPv6/IPv6-FB: não liberar nem devolver ao estoque. O provedor vende em blocos
  -- e não conseguimos cancelar/controlar IP individualmente; apenas ocultamos do painel.
  WITH expired_ipv6 AS (
    SELECT cp.id
    FROM public.customer_proxies cp
    JOIN public.orders o ON o.id = cp.order_id
    JOIN public.proxy_stock ps ON ps.id = cp.stock_id
    JOIN public.products p ON p.id = ps.product_id
    WHERE cp.status IN ('grace','active')
      AND o.status IN ('past_due','grace','cancelled','expired')
      AND (
        o.status IN ('cancelled','expired')
        OR (o.grace_until IS NOT NULL AND o.grace_until < now())
      )
      AND p.category IN ('ipv6','ipv6_fb')
  ), upd_ipv6 AS (
    UPDATE public.customer_proxies
       SET status='cancelled', released_at=now()
     WHERE id IN (SELECT id FROM expired_ipv6)
    RETURNING 1
  )
  SELECT count(*) INTO v_hidden FROM upd_ipv6;

  -- IPv4/ISP: ainda pode liberar, porque não há dependência de bloco IPv6 indivisível.
  WITH expired_other AS (
    SELECT cp.id, cp.stock_id
    FROM public.customer_proxies cp
    JOIN public.orders o ON o.id = cp.order_id
    JOIN public.proxy_stock ps ON ps.id = cp.stock_id
    JOIN public.products p ON p.id = ps.product_id
    WHERE cp.status IN ('grace','active')
      AND o.status IN ('past_due','grace','cancelled','expired')
      AND (
        o.status IN ('cancelled','expired')
        OR (o.grace_until IS NOT NULL AND o.grace_until < now())
      )
      AND COALESCE(p.category, '') NOT IN ('ipv6','ipv6_fb')
  ), upd_other AS (
    UPDATE public.customer_proxies
       SET status='released', released_at=now()
     WHERE id IN (SELECT id FROM expired_other)
    RETURNING stock_id
  ), rel_stock AS (
    UPDATE public.proxy_stock
       SET status='available'
     WHERE id IN (SELECT stock_id FROM upd_other)
       AND status='allocated'
    RETURNING 1
  )
  SELECT count(*) INTO v_released FROM rel_stock;

  RETURN QUERY SELECT (v_released + v_hidden);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_expired_grace_proxies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_grace_proxies() TO service_role;