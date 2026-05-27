import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/site/LegalLayout";

export const Route = createFileRoute("/termos")({
  component: TermosPage,
  head: () => ({
    meta: [
      { title: "Termos de Uso — FastProxy" },
      {
        name: "description",
        content:
          "Termos e condições gerais de uso dos serviços de proxy da FastProxy, em conformidade com o Marco Civil da Internet e a legislação brasileira.",
      },
      { property: "og:title", content: "Termos de Uso — FastProxy" },
      {
        property: "og:description",
        content: "Condições de uso, responsabilidades e compliance legal dos proxies FastProxy.",
      },
      { property: "og:url", content: "https://www.fastproxy.com.br/termos" },
    ],
    links: [{ rel: "canonical", href: "https://www.fastproxy.com.br/termos" }],
  }),
});

function TermosPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      subtitle="Leia com atenção as condições para a utilização dos serviços FastProxy."
      updatedAt="20 de maio de 2026"
    >
      <h2>1. Objeto e Aceitação</h2>
      <p>
        O presente Termo estabelece as condições gerais para a utilização do serviço de proxy fornecido pela FastProxy.
        Ao contratar nossos serviços, você declara ter lido, compreendido e aceitado todos os termos aqui descritos.
      </p>

      <h2>2. Utilização Responsável</h2>
      <p>
        A FastProxy fornece ferramentas de anonimato e roteamento de tráfego. O contratante é o{" "}
        <strong>único e exclusivo responsável</strong> pelas atividades realizadas através dos proxies fornecidos.
      </p>
      <p>É expressamente proibido o uso dos nossos serviços para:</p>
      <ul>
        <li>Práticas de crimes cibernéticos (invasão de dispositivos, DDoS, etc);</li>
        <li>Fraudes financeiras, clonagem de cartões ou phishing;</li>
        <li>Disseminação de spam ou conteúdo ilegal;</li>
        <li>Ataques a infraestruturas governamentais ou privadas;</li>
        <li>Qualquer atividade que viole as leis vigentes no território brasileiro.</li>
      </ul>

      <h2>3. Compliance Legal (Marco Civil)</h2>
      <p>
        Em total conformidade com a <strong>Lei nº 12.965/2014 (Marco Civil da Internet)</strong>, informamos que
        mantemos registros de logs de conexão pelo período de 1 (um) ano. Estes logs permitem identificar o usuário
        originário em caso de requisição judicial.
      </p>
      <p>
        Dados registrados incluem: IP de origem, data/hora da conexão, volume de tráfego e destino (host).
      </p>

      <h2>4. Responsabilidade Limitada</h2>
      <p>
        A FastProxy atua apenas como provedora de infraestrutura de rede. Não monitoramos o conteúdo do tráfego dos
        usuários, exceto em casos de suspeita de abuso que comprometa a integridade da nossa rede.
      </p>
      <p>
        Não nos responsabilizamos por perdas financeiras, bloqueios de contas em plataformas de terceiros (como Facebook,
        Google, etc) ou qualquer dano indireto decorrente do uso dos proxies.
      </p>

      <h2>5. Política de Pagamentos e Reembolsos</h2>
      <p>
        Nossos serviços são prestados na modalidade de <strong>assinatura recorrente</strong>. O cancelamento pode ser
        feito a qualquer momento através do painel do cliente ou suporte. Consulte nossa{" "}
        <a href="/reembolso">Política de Reembolso</a> para detalhes completos.
      </p>

      <h2>6. Suspensão e Rescisão</h2>
      <p>
        A FastProxy reserva-se o direito de suspender ou rescindir, sem aviso prévio, qualquer conta que viole estes
        Termos, sem direito a reembolso dos valores já pagos.
      </p>

      <h2>7. Alterações dos Termos</h2>
      <p>
        Estes Termos podem ser atualizados a qualquer momento. O usuário será notificado por e-mail ou pelo painel sobre
        alterações relevantes. A continuidade do uso após a alteração configura aceitação tácita.
      </p>

      <h2>8. Foro</h2>
      <p>
        Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer dúvidas oriundas deste termo, com renúncia
        a qualquer outro, por mais privilegiado que seja.
      </p>
    </LegalLayout>
  );
}
