-- Add source_mode to provider_settings ('api' = call VPS live, 'stock' = use manually-inserted proxy_stock rows)
ALTER TABLE public.provider_settings
  ADD COLUMN IF NOT EXISTS source_mode text NOT NULL DEFAULT 'api';

ALTER TABLE public.provider_settings
  DROP CONSTRAINT IF EXISTS provider_settings_source_mode_chk;

ALTER TABLE public.provider_settings
  ADD CONSTRAINT provider_settings_source_mode_chk
  CHECK (source_mode IN ('api','stock'));

-- Seed row for fastproxy_vps if missing
INSERT INTO public.provider_settings (provider, dry_run, source_mode)
VALUES ('fastproxy_vps', true, 'api')
ON CONFLICT (provider) DO NOTHING;

-- Update release function: manual stock rows (provider_order_id IS NULL) always
-- return to 'available' regardless of category, since we own the lifecycle.
CREATE OR REPLACE FUNCTION public.release_expired_grace_proxies()
 RETURNS TABLE(released_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_released int := 0;
  v_hidden int := 0;
BEGIN
  -- IPv6/IPv6-FB comprado no ProXySeller: bloco indivisível → apenas oculta.
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
      AND ps.provider_order_id IS NOT NULL   -- estoque manual não entra aqui
  ), upd_ipv6 AS (
    UPDATE public.customer_proxies
       SET status='cancelled', released_at=now()
     WHERE id IN (SELECT id FROM expired_ipv6)
    RETURNING 1
  )
  SELECT count(*) INTO v_hidden FROM upd_ipv6;

  -- IPv4/ISP + estoque manual (provider_order_id NULL): libera e devolve para 'available'.
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
      AND (
        COALESCE(p.category::text, '') NOT IN ('ipv6','ipv6_fb')
        OR ps.provider_order_id IS NULL
      )
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
$function$;