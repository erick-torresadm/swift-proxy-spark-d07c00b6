// Contatos do site — edite aqui para refletir nos componentes (Footer, WhatsAppFloat, Hero, CTAs).
// O número de WhatsApp deve estar no formato internacional sem "+" nem espaços (ex: 5511987654321).

export const CONTACT = {
  whatsappNumber: "5511999999999", // TODO: trocar pelo número real
  whatsappMessage: "Olá! Vim pelo site da FastProxy e quero tirar uma dúvida sobre os planos.",
  email: "suporte@fastproxy.com.br",
  telegram: "https://t.me/fastproxy", // TODO: ajustar handle
  instagram: "https://instagram.com/fastproxybr",
  twitter: "https://x.com/fastproxybr",
} as const;

export const whatsappUrl = (msg?: string) =>
  `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(msg ?? CONTACT.whatsappMessage)}`;
