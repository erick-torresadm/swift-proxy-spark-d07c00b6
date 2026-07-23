-- Backfill provider_orders.expires_at using the earliest expiry across each
-- block's stock rows. Fixes the renewal sweep which previously skipped all
-- blocks with NULL provider_orders.expires_at.
UPDATE public.provider_orders po
SET expires_at = sub.min_expiry
FROM (
  SELECT provider_order_id, MIN(expires_at) AS min_expiry
  FROM public.proxy_stock
  WHERE provider_order_id IS NOT NULL AND expires_at IS NOT NULL
  GROUP BY provider_order_id
) sub
WHERE po.id = sub.provider_order_id
  AND po.expires_at IS NULL;