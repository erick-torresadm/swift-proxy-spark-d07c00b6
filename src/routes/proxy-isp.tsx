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
      badge="Proxy ISP Residencial"
      Icon={Building2}
      title={
        <>
          Proxy <span className="text-gradient">ISP</span> com cara de residencial e velocidade de datacenter
        </>
      }
      subtitle="O melhor dos dois mundos: IPs registrados em provedores reais (não datacenter) com a velocidade e estabilidade de servidor dedicado."
      bullets={[
        "IPs registrados em provedores residenciais (ISP)",
        "Aparência 100% residencial pras plataformas",
        "Velocidade e estabilidade de datacenter",
        "Ideal para Instagram, WhatsApp e contas sociais",
        "Reposição inclusa e garantia de 7 dias",
      ]}
      useCases={[
        { title: "Instagram & WhatsApp", desc: "Multi-contas sem suspensão por suspeita de proxy ou VPN." },
        { title: "Social media managers", desc: "Gerenciamento de dezenas de perfis com IPs únicos e residenciais." },
        { title: "E-commerce stealth", desc: "Operações em marketplaces que detectam IPs de datacenter." },
      ]}
      priceFrom="R$ 49,90"
      whatsappMessage="Olá! Vi a página de Proxy ISP e quero tirar uma dúvida."
    />
  );
}
