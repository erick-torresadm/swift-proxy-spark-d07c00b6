-- Limpa 3 linhas fantasma de proxy_stock IPv4 EUA sem vínculo com provider_order
-- e sem external_proxy_id. Elas não correspondem a nenhum IP real do provedor
-- e estavam aparecendo como "available" indevidamente.
UPDATE public.proxy_stock
SET status = 'removed'
WHERE status = 'available'
  AND external_proxy_id IS NULL
  AND provider_order_id IS NULL;