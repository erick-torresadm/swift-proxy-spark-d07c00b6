import { createFileRoute } from "@tanstack/react-router";
import { Monitor } from "lucide-react";
import { ProductLanding } from "@/components/site/ProductLanding";

const SITE = "https://www.fastproxy.com.br";
const URL = SITE + "/proxy-ipv4";
const TITLE = "Proxy IPv4 Dedicado — Compatível com Tudo | FastProxy";
const DESC = "Proxies IPv4 dedicados com máxima compatibilidade. Funciona em qualquer plataforma, marketplace ou ferramenta. Entrega imediata e reposição automática.";

export const Route = createFileRoute("/proxy-ipv4")({
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
          name: "Proxy IPv4 Dedicado — FastProxy",
          description: DESC,
          brand: { "@type": "Brand", name: "FastProxy" },
          offers: {
            "@type": "Offer",
            price: "39.90",
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
      slug="ipv4-us"
      badge="Proxy IPv4 Dedicado"
      Icon={Monitor}
      title={
        <>
          Proxy <span className="text-gradient">IPv4</span> dedicado com compatibilidade total
        </>
      }
      subtitle="Quando precisa funcionar em qualquer lugar. IPv4 dedicado, ideal para sites e plataformas que ainda não aceitam IPv6."
      bullets={[
        "IPv4 100% dedicado — apenas você usa",
        "Compatível com qualquer site, marketplace e ferramenta",
        "Suporte HTTP e SOCKS5",
        "Entrega em até 10 minutos após pagamento",
        "Garantia de 7 dias e reposição inclusa",
      ]}
      useCases={[
        { title: "Marketplaces sensíveis", desc: "Mercado Livre, OLX, Amazon e sites antigos que bloqueiam IPv6." },
        { title: "SEO & SERP", desc: "Monitoramento de posicionamento e checagem de localização real." },
        { title: "Acesso geo-restrito", desc: "Conteúdos disponíveis apenas em regiões específicas." },
      ]}
      priceFrom="R$ 39,90"
      whatsappMessage="Olá! Vi a página de Proxy IPv4 e quero tirar uma dúvida."
    />
  );
}
