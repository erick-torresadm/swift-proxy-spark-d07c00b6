
CREATE INDEX IF NOT EXISTS idx_customer_proxies_status_stock
  ON public.customer_proxies(status, stock_id)
  WHERE status IN ('active','grace');

CREATE OR REPLACE FUNCTION public.pick_consolidated_stock(
  _product_ids uuid[],
  _limit integer
)
RETURNS TABLE(stock_id uuid, provider_order_id uuid, occupancy bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH avail AS (
    SELECT s.id, s.provider_order_id, s.expires_at
    FROM public.proxy_stock s
    WHERE s.product_id = ANY(_product_ids)
      AND s.status = 'available'
  ),
  occ AS (
    SELECT s.provider_order_id,
           count(cp.id) FILTER (WHERE cp.status IN ('active','grace')) AS used
    FROM public.proxy_stock s
    LEFT JOIN public.customer_proxies cp ON cp.stock_id = s.id
    WHERE s.provider_order_id IN (SELECT provider_order_id FROM avail WHERE provider_order_id IS NOT NULL)
    GROUP BY s.provider_order_id
  )
  SELECT a.id, a.provider_order_id, COALESCE(o.used, 0) AS occupancy
  FROM avail a
  LEFT JOIN occ o ON o.provider_order_id = a.provider_order_id
  ORDER BY COALESCE(o.used, 0) DESC NULLS LAST,
           a.expires_at ASC NULLS LAST,
           a.id
  LIMIT GREATEST(_limit, 0);
$$;

GRANT EXECUTE ON FUNCTION public.pick_consolidated_stock(uuid[], integer) TO service_role;
