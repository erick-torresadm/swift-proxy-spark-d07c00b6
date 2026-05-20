import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Qual a diferença entre proxy IPv6, IPv4 e ISP?",
    a: "O IPv6 é o mais barato e indicado para grandes volumes de automação. O IPv4 tem compatibilidade máxima com qualquer plataforma. O ISP combina os dois mundos: velocidade de datacenter com a confiabilidade de IPs residenciais.",
  },
  {
    q: "A entrega é realmente imediata?",
    a: "Sim. Após o pagamento aprovado, os proxies aparecem no seu painel em segundos — você já pode começar a usar.",
  },
  {
    q: "Como funciona a reposição?",
    a: "Todo plano inclui reposição. Se um proxy parar de funcionar, basta um clique no painel para gerar um novo automaticamente, sem precisar abrir chamado.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Não há fidelidade. Você pode pausar ou cancelar sua assinatura direto pelo painel a qualquer momento.",
  },
  {
    q: "Aceitam Pix e cartão recorrente?",
    a: "Aceitamos Pix, cartão de crédito (com cobrança recorrente automática) e boleto. Tudo processado de forma segura.",
  },
  {
    q: "Os proxies funcionam para Instagram, WhatsApp, Google?",
    a: "Sim. Nossos proxies dedicados (especialmente IPv4 e ISP) são compatíveis com as principais plataformas. Para Instagram e WhatsApp recomendamos ISP.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-block px-4 py-1.5 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            FAQ
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            Perguntas <span className="text-gradient">frequentes</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Tudo o que você precisa saber antes de começar.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border border-border rounded-2xl bg-card px-6 data-[state=open]:border-primary/30 transition"
              >
                <AccordionTrigger className="text-left font-bold text-base hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
