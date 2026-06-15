import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ProductLanding } from "@/components/site/ProductLanding";

const SITE = "https://www.fastproxy.com.br";
const URL = SITE + "/proxy-isp";
const TITLE = "Proxy Residencial Brasil — ISP Dedicado, Instagram & WhatsApp | FastProxy";
const DESC = "Proxy residencial dedicado no Brasil: IPs registrados em provedores reais (não datacenter) com velocidade de servidor. Perfeito pra Instagram, WhatsApp, Facebook Ads e multi-contas. A partir de R$ 49,90.";


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
      slug="isp-us"
      badge="Proxy Residencial Brasil"
      Icon={Building2}
      title={
        <>
          Proxy <span className="text-gradient">residencial</span> com aparência real e velocidade de datacenter
        </>
      }
      subtitle="O melhor dos dois mundos: IPs registrados em provedores residenciais (ISP) com a estabilidade e velocidade de servidor dedicado. O proxy residencial certo pra quem leva multi-contas a sério."
      bullets={[
        "IPs residenciais registrados em provedores (ISP) brasileiros",
        "Aparência 100% residencial — Instagram, WhatsApp e Meta não detectam como proxy",
        "Velocidade e estabilidade de datacenter, sem queda",
        "Compatível com AdsPower, Dolphin, Multilogin e GoLogin",
        "Reposição inclusa, garantia de 7 dias e suporte humano",
      ]}
      useCases={[
        { title: "Instagram & WhatsApp", desc: "Gerencie múltiplas contas sem suspensão por suspeita de proxy, VPN ou datacenter." },
        { title: "Facebook Ads & BMs", desc: "Proxy residencial limpo pra rodar BMs e contas de anúncio sem bloqueio." },
        { title: "E-commerce e marketplaces", desc: "Mercado Livre, Amazon e plataformas que detectam e bloqueiam IPs de datacenter." },
      ]}
      priceFrom="R$ 49,90"
      whatsappMessage="Olá! Quero comprar um proxy residencial e tenho dúvidas."

    />
  );
}
