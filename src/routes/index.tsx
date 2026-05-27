import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { Stats } from "@/components/site/Stats";
import { Marquee } from "@/components/site/Marquee";
import { Solution } from "@/components/site/Solution";
import { Features } from "@/components/site/Features";
import { Plans } from "@/components/site/Plans";
import { FAQ } from "@/components/site/FAQ";
import { CTA } from "@/components/site/CTA";
import { Footer } from "@/components/site/Footer";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { InstallGuide } from "@/components/site/InstallGuide";

const SITE = "https://www.fastproxy.com.br";

const FAQ_ITEMS = [
  { q: "Qual a diferença entre proxy IPv6, IPv4 e ISP?", a: "O IPv6 é o mais barato e indicado para grandes volumes de automação. O IPv4 tem compatibilidade máxima com qualquer plataforma. O ISP combina velocidade de datacenter com a confiabilidade de IPs residenciais." },
  { q: "A entrega é realmente imediata?", a: "Sim. Após o pagamento aprovado, os proxies aparecem no seu painel em segundos — você já pode começar a usar." },
  { q: "Como funciona a reposição?", a: "Todo plano inclui reposição. Se um proxy parar de funcionar, um clique no painel gera um novo automaticamente." },
  { q: "Posso cancelar quando quiser?", a: "Sim. Não há fidelidade. Você pode pausar ou cancelar sua assinatura direto pelo painel a qualquer momento." },
  { q: "Aceitam Pix e cartão recorrente?", a: "Aceitamos Pix, cartão de crédito (cobrança recorrente automática) e boleto. Tudo processado de forma segura." },
  { q: "Os proxies funcionam para Instagram, WhatsApp, Google?", a: "Sim. Nossos proxies dedicados (especialmente IPv4 e ISP) são compatíveis com as principais plataformas. Para Instagram e WhatsApp recomendamos ISP." },
];

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { property: "og:url", content: SITE + "/" },
    ],
    links: [
      { rel: "canonical", href: SITE + "/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "FastProxy — Proxy Dedicado",
          description: "Proxies HTTP e SOCKS5 dedicados no Brasil: IPv6, IPv4 e ISP.",
          brand: { "@type": "Brand", name: "FastProxy" },
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "BRL",
            lowPrice: "29.90",
            offerCount: "3",
            availability: "https://schema.org/InStock",
            url: SITE + "/",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "237",
          },
        }),
      },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <ScrollProgress />
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Marquee />
        <Solution />
        <Features />
        <InstallGuide />
        <Plans />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
