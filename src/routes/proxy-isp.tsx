import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ProductLanding } from "@/components/site/ProductLanding";

const SITE = "https://www.fastproxy.com.br";
const URL = SITE + "/proxy-isp";
const TITLE = "Proxy ISP Dedicado Brasil — Instagram & WhatsApp | FastProxy";
const DESC = "Proxy ISP dedicado no Brasil: IP fixo, pool separado do datacenter genérico, com velocidade de servidor. Perfeito pra Instagram, WhatsApp, Facebook Ads e multi-contas. A partir de R$ 49,90.";


export const Route = createFileRoute("/proxy-isp")({
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
          name: "Proxy ISP Dedicado — FastProxy",
          description: DESC,
          brand: { "@type": "Brand", name: "FastProxy" },
          offers: {
            "@type": "Offer",
            price: "49.90",
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
      slug="isp-br"
      badge="Proxy ISP Dedicado Brasil"
      Icon={Building2}
      title={
        <>
          Proxy <span className="text-gradient">ISP dedicado</span> com estabilidade e velocidade de servidor
        </>
      }
      subtitle="IP fixo brasileiro em um pool separado do datacenter genérico de automação, com a estabilidade e velocidade de servidor dedicado. Bom custo-benefício pra quem leva multi-contas a sério — sem prometer o que não é: continua sendo um IP hospedado, não uma linha residencial de operadora."
      bullets={[
        "IP fixo dedicado, num pool próprio separado do datacenter genérico",
        "Reputação historicamente mais limpa que blocos de datacenter comuns",
        "Estabilidade e velocidade de servidor dedicado, sem queda",
        "Compatível com AdsPower, Dolphin, Multilogin e GoLogin",
        "Reposição inclusa, garantia de 7 dias e suporte humano",
      ]}
      useCases={[
        { title: "Instagram & WhatsApp", desc: "Multi-contas com IP fixo e reputação mais limpa que datacenter genérico — sem garantir passar por checagem de ASN de operadora." },
        { title: "Facebook Ads & BMs", desc: "Proxy dedicado com histórico mais limpo pra rodar BMs e contas de anúncio." },
        { title: "E-commerce e marketplaces", desc: "Mercado Livre, Amazon e plataformas sensíveis a IP de datacenter comum." },
      ]}
      priceFrom="R$ 49,90"
      whatsappMessage="Olá! Quero comprar um proxy residencial e tenho dúvidas."

    />
  );
}
