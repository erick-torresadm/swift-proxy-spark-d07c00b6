
UPDATE public.products
SET provider_tariff_id = '{"countryId":20554,"periodId":"1m"}'::text,
    updated_at = now()
WHERE slug IN ('ipv6-br', 'ipv6-fb-br');

UPDATE public.products
SET provider_tariff_id = '{"countryId":785,"periodId":"1m"}'::text,
    updated_at = now()
WHERE slug = 'ipv6-us';
