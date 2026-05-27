import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/site/LegalLayout";

export const Route = createFileRoute("/reembolso")({
  component: ReembolsoPage,
  head: () => ({
    meta: [
      { title: "Política de Reembolso e Cancelamento — FastProxy" },
      {
        name: "description",
        content:
          "Direito de arrependimento de 7 dias (CDC Art. 49), cancelamento sem burocracia e reembolso integral em caso de falha técnica. Veja todas as regras.",
      },
      { property: "og:title", content: "Política de Reembolso — FastProxy" },
      {
        property: "og:description",
        content: "7 dias de arrependimento, cancelamento sem burocracia e regras de reembolso.",
      },
      { property: "og:url", content: "https://www.fastproxy.com.br/reembolso" },
    ],
    links: [{ rel: "canonical", href: "https://www.fastproxy.com.br/reembolso" }],
  }),
});

function ReembolsoPage() {
  return (
    <LegalLayout
      title="Política de Reembolso e Cancelamento"
      subtitle="Em conformidade com o Código de Defesa do Consumidor (Lei 8.078/1990) e as diretrizes do PROCON."
      updatedAt="20 de maio de 2026"
    >
      <div className="not-prose mb-8 p-4 rounded-xl border border-primary/30 bg-primary/10 text-sm">
        <strong className="text-primary">⚠️ Importante:</strong> Esta política está em conformidade com o Código de
        Defesa do Consumidor (Lei 8.078/1990) e as diretrizes do PROCON.
      </div>

      <h2>1. Direito de Arrependimento (Art. 49, CDC)</h2>
      <p>
        <strong>✅ Você tem 7 dias</strong> para testar nosso serviço sem compromisso!
      </p>
      <p>
        De acordo com o Art. 49 do Código de Defesa do Consumidor, o USUÁRIO pode exercer o direito de arrependimento no
        prazo de <strong>7 (sete) dias</strong> contados da contratação ou recebimento do produto/serviço.
      </p>
      <p><strong>Como exercer:</strong></p>
      <ul>
        <li>Enviar e-mail para: <strong>suporte@fastproxy.com.br</strong></li>
        <li>Informar o número do pedido / e-mail cadastrado;</li>
        <li>Ou utilizar o painel do cliente para solicitar o cancelamento.</li>
      </ul>
      <p>
        <strong>Importante:</strong> O reembolso será realizado em até <strong>10 (dez) dias úteis</strong> após a
        solicitação, preferencialmente pelo mesmo meio de pagamento utilizado na compra.
      </p>

      <h2>2. Cancelamento de Assinatura</h2>
      <p>O USUÁRIO pode cancelar sua assinatura a qualquer momento, sem burocracia, através de:</p>
      <ul>
        <li><strong>Painel do Cliente:</strong> Acesse sua conta &gt; Configurações &gt; Cancelar assinatura;</li>
        <li><strong>E-mail:</strong> suporte@fastproxy.com.br;</li>
        <li><strong>WhatsApp:</strong> via link de suporte.</li>
      </ul>
      <p>
        <strong>💡 Antes de cancelar:</strong> Oferecemos um cupom de <strong>50% de desconto</strong> para você
        continuar usando nossos serviços. Entre em contato com o suporte antes de cancelar!
      </p>

      <h2>3. Política de Reembolso</h2>

      <h3>3.1. Reembolso Integral</h3>
      <p>O USUÁRIO terá direito a reembolso integral nas seguintes situações:</p>
      <ul>
        <li><strong>Arrependimento:</strong> solicitado dentro de 7 dias da compra (Art. 49, CDC);</li>
        <li><strong>Falha Técnica:</strong> quando o serviço estiver indisponível por mais de 72 horas consecutivas, sem justificativa;</li>
        <li><strong>Erro de Cobrança:</strong> cobrança indevida ou duplicada;</li>
        <li><strong>Serviço Não Prestado:</strong> quando, por qualquer motivo imputável à FastProxy, o serviço não puder ser prestado.</li>
      </ul>

      <h3>3.2. Reembolso Parcial</h3>
      <p>Será concedido reembolso proporcional nos seguintes casos:</p>
      <ul>
        <li><strong>Uso parcial:</strong> reembolso proporcional aos dias não utilizados após o período de teste de 7 dias;</li>
        <li><strong>Serviço degradado:</strong> quando a qualidade ficar significativamente abaixo do esperado por mais de 15 dias consecutivos;</li>
        <li><strong>Interrupção prolongada:</strong> reembolso proporcional ao período em que o serviço esteve indisponível por mais de 72 horas.</li>
      </ul>

      <h3>3.3. Sem Direito a Reembolso</h3>
      <p>Não haverá reembolso nas seguintes situações:</p>
      <ul>
        <li>Solicitações após 7 dias da compra (exceto em casos de falha técnica comprovada);</li>
        <li>Utilização do serviço por mais de 7 dias;</li>
        <li>Cancelamento após renovação automática (o acesso será mantido até o fim do período pago);</li>
        <li>Violação dos Termos de Uso que resulte em suspensão ou rescisão;</li>
        <li>Alteração de ideia sem motivo técnico válido.</li>
      </ul>

      <h2>4. Forma de Reembolso</h2>
      <p>O reembolso será realizado pela <strong>mesma forma de pagamento</strong> utilizada na compra:</p>
      <ul>
        <li><strong>Cartão de Crédito:</strong> estorno em até 2 ciclos de faturamento (conforme política da bandeira);</li>
        <li><strong>PIX:</strong> transferência para conta informada pelo USUÁRIO em até 5 dias úteis;</li>
        <li><strong>Boleto:</strong> crédito em conta bancária informada em até 10 dias úteis.</li>
      </ul>

      <h2>5. Cancelamento pelo Admin</h2>
      <p>Quando um administrador cancelar a assinatura de um USUÁRIO:</p>
      <ul>
        <li>O USUÁRIO receberá aviso prévio de 7 dias por e-mail;</li>
        <li>Antes do cancelamento definitivo, será oferecido automaticamente um <strong>cupom de 50% de desconto</strong> para renovação;</li>
        <li>Caso o USUÁRIO não aceite o desconto, a assinatura será cancelada ao final do período pago;</li>
        <li>Não haverá reembolso para períodos já pagos, exceto nas situações previstas no item 3.1.</li>
      </ul>

      <h2>6. Processos de Contestação (Chargeback)</h2>
      <p>
        <strong>⚠️ Importante:</strong> Solicitamos que, antes de abrir um chargeback (contestação), o USUÁRIO entre em
        contato com nosso suporte pelo e-mail <strong>suporte@fastproxy.com.br</strong> ou WhatsApp.
      </p>
      <p>Chargebacks desnecessários podem resultar em:</p>
      <ul>
        <li>Perda de acesso imediato ao serviço;</li>
        <li>Cobrança de taxa administrativa de R$ 15,00;</li>
        <li>Impossibilidade de criação de novas contas.</li>
      </ul>
      <p>Reservamo-nos o direito de contestar qualquer chargeback injustificado junto às operadoras de cartão.</p>

      <h2>7. Procedimento para Solicitação</h2>
      <ol>
        <li>Entre em contato pelo e-mail <strong>suporte@fastproxy.com.br</strong> ou pelo painel do cliente;</li>
        <li>Informe seu e-mail cadastrado e número do pedido (se houver);</li>
        <li>Descreva o motivo da solicitação;</li>
        <li>Aguarde retorno em até <strong>48 horas úteis</strong>;</li>
        <li>Após aprovação, o reembolso será processado conforme item 4.</li>
      </ol>

      <h2>8. Contato</h2>
      <p>Para qualquer dúvida sobre esta política ou para processar uma solicitação:</p>
      <ul>
        <li><strong>E-mail:</strong> suporte@fastproxy.com.br</li>
        <li><strong>Horário de atendimento:</strong> Segunda a Sexta, 9h às 18h</li>
      </ul>

      <h2>9. Disposições Finais</h2>
      <p>
        Esta política é parte integrante dos <a href="/termos">Termos de Uso</a> e da{" "}
        <a href="/privacidade">Política de Privacidade</a> da FastProxy.
      </p>
    </LegalLayout>
  );
}
