import { createFileRoute } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { ProductLanding } from "@/components/site/ProductLanding";

const SITE = "https://www.fastproxy.com.br";
const URL = SITE + "/proxy-ipv6";
const TITLE = "Proxy IPv6 Brasil — Dedicado, R$ 29,90 | FastProxy";
const DESC = "Proxies IPv6 dedicados no Brasil a partir de R$ 29,90. Entrega imediata, reposição automática e suporte humano. Ideal para automação e scraping em larga escala.";

export const Route = createFileRoute("/proxy-ipv6")({
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
          name: "Proxy IPv6 Brasil — FastProxy",
          description: DESC,
          brand: { "@type": "Brand", name: "FastProxy" },
          offers: {
            "@type": "Offer",
            price: "29.90",
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
      slug="ipv6-br"
      badge="Proxy IPv6 Brasil"
      Icon={Globe}
      title={
        <>
          Proxy <span className="text-gradient">IPv6 Brasil</span> dedicado, escalável e barato
        </>
      }
      subtitle="O proxy ideal para automação, scraping e grandes volumes. Mais barato, mais rápido e com a confiabilidade de IPs dedicados do Brasil."
      bullets={[
        "IPv6 dedicado e exclusivo — nunca compartilhado",
        "Suporte HTTP e SOCKS5, autenticação por usuário/senha",
        "Entrega imediata após pagamento aprovado",
        "Reposição com 1 clique direto no painel",
        "Reposição automática e suporte humano em até 15min",
      ]}
      useCases={[
        { title: "Automação em larga escala", desc: "Bots de Instagram, WhatsApp Business, Twitter e Telegram com IPs limpos." },
        { title: "Web scraping", desc: "Coletar preços, dados públicos e SERP sem rate-limit nem bloqueio." },
        { title: "Multi-contas", desc: "Gerenciar dezenas de contas isoladas em ferramentas como GoLogin e Multilogin." },
      ]}
      priceFrom="R$ 29,90"
      whatsappMessage="Olá! Vi a página de Proxy IPv6 BR e quero tirar uma dúvida."
    />
  );
}
