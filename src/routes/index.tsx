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
import { VideoShowcase } from "@/components/site/VideoShowcase";
import { Testimonials } from "@/components/site/Testimonials";
import { WhatsAppFloat } from "@/components/site/WhatsAppFloat";

const SITE = "https://www.fastproxy.com.br";

const TITLE = "Comprar Proxy Brasil — IPv6, IPv4 e ISP Residencial Dedicado | FastProxy";
const DESC = "Proxy brasileiro dedicado a partir de R$ 29,90/mês. IPv6, IPv4 e ISP residencial com entrega imediata, reposição automática e suporte 24/7. Ideal para anunciantes, multi-contas, scraping e automação.";

const FAQ_ITEMS = [
  { q: "O que é proxy residencial e para que serve?", a: "Proxy residencial é um IP registrado em provedores de internet reais (não datacenter), o que faz seu tráfego parecer vir de uma casa comum. Serve pra rodar múltiplas contas em Instagram, WhatsApp, Facebook Ads e marketplaces sem ser detectado como bot ou VPN." },
  { q: "Qual o valor mensal de um proxy residencial no Brasil?", a: "Em média entre R$ 39 e R$ 90 por IP, dependendo da localização e do provedor. Na FastProxy o IPv6 dedicado começa em R$ 29,90/mês, o IPv4 em R$ 39,90 e o ISP residencial em R$ 49,90." },
  { q: "Como comprar proxy na FastProxy?", a: "Escolha o plano (IPv6, IPv4 ou ISP), pague via Pix, cartão ou boleto e em segundos os proxies aparecem no seu painel prontos pra uso. Sem fidelidade, com reposição automática inclusa." },
  { q: "Onde comprar proxy dedicado no Brasil que aceite Pix?", a: "A FastProxy aceita Pix instantâneo, cartão de crédito recorrente e boleto. Os proxies são entregues automaticamente após o pagamento ser confirmado." },
  { q: "Qual a diferença entre proxy IPv6, IPv4 e ISP?", a: "IPv6 é o mais barato e indicado para automação e scraping em larga escala. IPv4 tem compatibilidade máxima com qualquer plataforma. ISP é residencial — combina velocidade de datacenter com a confiabilidade de IPs registrados em provedores reais, ideal para Instagram, WhatsApp e Facebook Ads." },
  { q: "Proxy da FastProxy funciona com Facebook Ads, AdsPower e Dolphin?", a: "Sim. Nossos proxies IPv6 e ISP são compatíveis com os principais antidetect browsers (AdsPower, Dolphin Anty, Multilogin, GoLogin) e ferramentas de gestão de BMs e contas de anúncio." },
  { q: "A entrega é realmente imediata?", a: "Sim. Após o pagamento aprovado, os proxies aparecem no seu painel em segundos — você já pode começar a usar." },
  { q: "Como funciona a reposição?", a: "Todo plano inclui reposição. Se um proxy parar de funcionar, um clique no painel gera um novo automaticamente." },
  { q: "Posso cancelar quando quiser?", a: "Sim. Não há fidelidade. Você pode pausar ou cancelar sua assinatura direto pelo painel a qualquer momento." },
];

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: SITE + "/" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
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
          name: "FastProxy — Proxy Dedicado Brasil",
          description: "Proxies HTTP e SOCKS5 dedicados no Brasil: IPv6, IPv4 e ISP residencial.",
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
        <VideoShowcase />
        <Features />
        <InstallGuide />
        <Testimonials />
        <Plans />
        <FAQ />
        <CTA />
      </main>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
