import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/site/LegalLayout";

export const Route = createFileRoute("/privacidade")({
  component: PrivacidadePage,
  head: () => ({
    meta: [
      { title: "Política de Privacidade — FastProxy" },
      {
        name: "description",
        content:
          "Como a FastProxy coleta, usa e protege seus dados pessoais em conformidade com a LGPD (Lei nº 13.709/2018) e o Marco Civil da Internet.",
      },
      { property: "og:title", content: "Política de Privacidade — FastProxy" },
      {
        property: "og:description",
        content: "Tratamento de dados conforme LGPD e Marco Civil da Internet.",
      },
      { property: "og:url", content: "https://www.fastproxy.com.br/privacidade" },
    ],
    links: [{ rel: "canonical", href: "https://www.fastproxy.com.br/privacidade" }],
  }),
});

function PrivacidadePage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      subtitle="Tratamos seus dados com transparência e em total conformidade com a LGPD."
      updatedAt="20 de maio de 2026"
    >
      <h2>1. Coleta de Informações</h2>
      <p>Para a prestação de nossos serviços, coletamos apenas os dados essenciais:</p>
      <ul>
        <li><strong>Dados Cadastrais:</strong> Nome, e-mail, WhatsApp e CPF (para fins de faturamento e conformidade).</li>
        <li><strong>Dados de Pagamento:</strong> Processados de forma segura pelo Stripe. Não armazenamos os dados do seu cartão em nossos servidores.</li>
        <li><strong>Logs de Conexão:</strong> Endereço IP de origem e carimbos de data/hora (exigidos pelo Marco Civil da Internet).</li>
      </ul>

      <h2>2. Uso dos Dados</h2>
      <p>Seus dados são utilizados exclusivamente para:</p>
      <ul>
        <li>Processar sua assinatura e ativar seus proxies;</li>
        <li>Enviar notificações importantes sobre sua conta;</li>
        <li>Garantir a segurança da nossa rede contra abusos;</li>
        <li>Cumprir obrigações legais brasileiras.</li>
      </ul>

      <h2>3. Compartilhamento com Terceiros</h2>
      <p>
        <strong>NÃO vendemos ou alugamos</strong> seus dados pessoais para terceiros. O compartilhamento ocorre apenas com:
      </p>
      <ul>
        <li>Processadores de pagamento (Stripe);</li>
        <li>Autoridades judiciais, mediante ordem legal válida conforme a legislação brasileira.</li>
      </ul>

      <h2>4. Proteção de Dados (LGPD)</h2>
      <p>
        Atuamos em conformidade com a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong>. Você tem o direito de solicitar
        a correção, portabilidade ou exclusão de seus dados, desde que não conflite com obrigações legais de retenção (como os logs do Marco Civil).
      </p>

      <h2>5. Cookies e Rastreamento</h2>
      <p>
        Utilizamos cookies apenas para manter sua sessão ativa em nosso painel administrativo e melhorar a experiência de navegação.
        Não utilizamos cookies de rastreamento de terceiros para publicidade.
      </p>

      <h2>6. Segurança</h2>
      <p>
        Implementamos criptografia SSL em todas as comunicações e mantemos firewalls ativos para proteger nossos bancos de dados.
        Recomendamos que você utilize senhas fortes e não compartilhe seu acesso ao painel com terceiros.
      </p>

      <h2>7. Contato do DPO</h2>
      <p>
        Dúvidas sobre sua privacidade? Contate nosso Encarregado de Proteção de Dados:{" "}
        <a href="mailto:dpo@fastproxy.com.br">dpo@fastproxy.com.br</a>
      </p>
    </LegalLayout>
  );
}
