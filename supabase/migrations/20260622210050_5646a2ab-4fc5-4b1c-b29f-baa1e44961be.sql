-- Categorias
INSERT INTO public.post_categories (slug, name) VALUES ('comparativos', 'Comparativos') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_categories (slug, name) VALUES ('privacidade', 'Privacidade') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_categories (slug, name) VALUES ('trafego-pago', 'Tráfego Pago') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_categories (slug, name) VALUES ('tutoriais', 'Tutoriais') ON CONFLICT (slug) DO NOTHING;

-- Tags
INSERT INTO public.post_tags (slug, name) VALUES ('adspower', 'AdsPower') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('anonimato', 'Anonimato') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('antidetect', 'Antidetect') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('bm-bloqueada', 'BM Bloqueada') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('contingencia', 'Contingência') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('dolphin-anty', 'Dolphin Anty') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('facebook-ads', 'Facebook Ads') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('google-ads', 'Google Ads') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('ipv6', 'IPv6') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('isp', 'ISP') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('multilogin', 'Multilogin') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('proxy-dedicado', 'Proxy Dedicado') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('residencial', 'Residencial') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('tiktok-ads', 'TikTok Ads') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('tutorial', 'Tutorial') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.post_tags (slug, name) VALUES ('vpn', 'VPN') ON CONFLICT (slug) DO NOTHING;