
UPDATE public.products SET price_monthly_cents = 4990, price_yearly_cents = 49401, updated_at = now() WHERE slug = 'ipv4-us';
UPDATE public.products SET price_monthly_cents = 9900, price_yearly_cents = 98010, updated_at = now() WHERE slug = 'isp-us';

INSERT INTO public.products (slug, name, description, category, country_code, delivery_mode, block_size, ip_rotations_per_month, price_monthly_cents, price_yearly_cents, active)
SELECT 'ipv6-fb-us', 'IPv6 Facebook Ads EUA', 'IPv6 otimizado para Facebook Ads — IPs dos EUA', 'ipv6_fb', 'US', 'stock', 1, 10, 8000, 79200, true
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE slug = 'ipv6-fb-us');
