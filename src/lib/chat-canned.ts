// Mensagens pré-prontas / ensinamentos para o suporte de proxies
export type CannedCategory = {
  label: string;
  items: { title: string; body: string }[];
};

export const CANNED_MESSAGES: CannedCategory[] = [
  {
    label: "Saudações",
    items: [
      {
        title: "Boas-vindas",
        body:
          "Olá! 👋 Bem-vindo ao suporte. Sou da equipe e vou te ajudar agora mesmo. Pode me dizer qual é o seu pedido ou e-mail cadastrado?",
      },
      {
        title: "Aguarde um momento",
        body:
          "Só um instante, estou verificando aqui no painel para te dar uma resposta certinha. 🙏",
      },
      {
        title: "Despedida",
        body:
          "Foi um prazer te ajudar! Qualquer dúvida é só chamar de novo. Bom uso dos proxies! 🚀",
      },
    ],
  },
  {
    label: "Como usar (IPv6 / IPv4)",
    items: [
      {
        title: "Formato HOST:PORT:USER:PASS",
        body:
          "Os proxies são entregues no formato:\n\nHOST:PORTA:USUARIO:SENHA\n\nExemplo:\n198.51.100.10:8085:meuuser:minhasenha\n\nUse esse formato em qualquer ferramenta (navegador, antidetect, scraper).",
      },
      {
        title: "Configurar no navegador (proxy manual)",
        body:
          "1) Instale a extensão Proxy SwitchyOmega (Chrome) ou FoxyProxy (Firefox).\n2) Crie um perfil HTTP/HTTPS.\n3) Cole HOST e PORTA, marque 'Requer autenticação' e informe USUÁRIO/SENHA.\n4) Ative o perfil e teste em https://ipinfo.io — o IP deve mudar para o do proxy.",
      },
      {
        title: "IPv6 — como testar",
        body:
          "Para IPv6 o site precisa suportar conexão v6. Teste em:\n• https://ipv6.icanhazip.com\n• https://test-ipv6.com\n\nSe o site só roda em IPv4, o IPv6 não vai aparecer — isso é normal.",
      },
      {
        title: "Antidetect (AdsPower / Dolphin / GoLogin)",
        body:
          "Em qualquer antidetect crie um perfil novo → Proxy → HTTP (ou SOCKS5).\nPreencha:\nHost: (o IP)\nPort: (a porta)\nUser: (usuário)\nPass: (senha)\nClique em 'Check Proxy' antes de salvar.",
      },
    ],
  },
  {
    label: "Problemas comuns",
    items: [
      {
        title: "Proxy não conecta",
        body:
          "Vamos checar 3 coisas rapidinho:\n1) Você está usando HOST:PORT:USER:PASS exatamente como foi entregue?\n2) O tipo está como HTTP/HTTPS (e não SOCKS5)?\n3) Seu firewall/antivírus está bloqueando? Tente em outra rede.\n\nSe ainda não funcionar, me envie um print da configuração.",
      },
      {
        title: "Site detectou o proxy",
        body:
          "Alguns sites bloqueiam datacenter ou pedem residencial. Recomendo:\n• Limpar cookies/cache do navegador antes de logar.\n• Usar fingerprint único (antidetect).\n• Trocar para outro IP da lista, ou migrar para residencial se o destino for sensível.",
      },
      {
        title: "IP aparece como outro país",
        body:
          "Isso pode acontecer quando o site usa geolocalização por DNS/CDN. Confirme o país real em:\n• https://ipinfo.io\n• https://whoer.net\n\nSe os dois mostrarem o país certo, o proxy está OK.",
      },
      {
        title: "Velocidade lenta",
        body:
          "Teste a velocidade real em https://fast.com COM o proxy ativo. Se estiver muito baixo:\n• Verifique se seu link próprio está bom (sem proxy).\n• Troque por outro IP da lista.\n• Para vídeo/streaming pesado, recomendamos residencial.",
      },
    ],
  },
  {
    label: "Compra / Renovação",
    items: [
      {
        title: "Confirmar pedido",
        body:
          "Pode me passar o número do pedido ou o e-mail usado na compra? Vou localizar aqui na hora. 🔎",
      },
      {
        title: "Renovação automática",
        body:
          "A renovação não é automática por padrão. Quando o proxy estiver perto do vencimento eu te aviso por aqui e por e-mail para você renovar com 1 clique.",
      },
      {
        title: "Trocar IP / país",
        body:
          "Sem problema! Me diga: qual proxy você quer trocar (ID ou IP atual) e para qual país/tipo (IPv4, IPv6, residencial) quer migrar. Faço aqui pra você.",
      },
      {
        title: "Reembolso",
        body:
          "Trabalhamos com garantia de funcionamento. Me explique o que aconteceu e, se for o caso, processo o reembolso/credito direto na sua conta.",
      },
    ],
  },
];
