CREATE UNIQUE INDEX IF NOT EXISTS proxy_stock_provider_proxy_port_unique
ON public.proxy_stock (provider_order_id, external_proxy_id, port)
WHERE provider_order_id IS NOT NULL AND external_proxy_id IS NOT NULL;