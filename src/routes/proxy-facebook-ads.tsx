import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { ProductLanding } from "@/components/site/ProductLanding";

const SITE = "https://www.fastproxy.com.br";
const URL = SITE + "/proxy-facebook-ads";
const TITLE = "Proxy para Facebook Ads e Anunciantes — IPv6 Limpo | FastProxy";
const DESC = "Proxy pra Facebook Ads, Google Ads e anunciantes de tráfego pago. IPv6 dedicado e limpo, compatível com AdsPower, Dolphin, Multilogin e GoLogin. Escale BMs e contas de anúncio sem bloqueio. A partir de R$ 79,90.";


export const Route = createFileRoute("/proxy-facebook-ads")({
  component: Page,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: URL },
      { property: "og:type", content: "product" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Proxy IPv6 para Facebook Ads — FastProxy",
          description: DESC,
          brand: { "@type": "Brand", name: "FastProxy" },
          offers: {
            "@type": "Offer",
            price: "79.90",
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
            url: URL,
          },
        }),
      },
    ],
  }),
});

function Page() {
  return (
    <ProductLanding
      slug="ipv6-fb-br"
      badge="Proxy para Facebook Ads"
      Icon={Target}
      title={
        <>
          O proxy que <span className="text-gradient">Facebook Ads</span> aceita sem bloquear
        </>
      }
      subtitle="IPv6 otimizado especificamente pra gestão de BMs e contas de anúncio. Pool de IPs limpos, testados e dedicados pra você escalar sem medo."
      bullets={[
        "IPs IPv6 dedicados e limpos pra Facebook Ads",
        "Pool exclusivo, sem reuso por outros clientes",
        "Reduz drasticamente o risco de bloqueio de BM",
        "Compatível com Multilogin, AdsPower, Dolphin e GoLogin",
        "Suporte especializado em tráfego pago",
      ]}
      useCases={[
        { title: "Agências de tráfego", desc: "Gestão de dezenas de BMs e contas de anúncio com IP único por perfil." },
        { title: "Afiliados black/grey", desc: "Operações sensíveis que precisam de IPs limpos e troca rápida." },
        { title: "Escala de criativos", desc: "Múltiplas contas de teste rodando paralelamente sem cruzamento de IP." },
      ]}
      priceFrom="R$ 79,90"
      whatsappMessage="Olá! Vi a página de Proxy pra Facebook Ads e quero tirar uma dúvida."
    />
  );
}
