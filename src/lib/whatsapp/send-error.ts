/*
 * Tradução dos erros de envio do WhatsApp (API Cloud da Meta) para português
 * claro, com o que fazer em cada caso.
 *
 * O erro cru fica em whatsapp_messages.error — vem da resposta da Meta na hora
 * do envio ou do webhook de status. O texto da Meta costuma trazer o código
 * entre parênteses, ex.: "(#131047) Message failed to send because more than
 * 24 hours have passed since the customer last replied to this number".
 */

export type SendFailure = {
  /** Código da Meta, quando dá para identificar. */
  code: string | null;
  /** O que aconteceu, em uma linha. */
  title: string;
  /** O que o time precisa fazer. */
  action: string;
  /** Se o problema é da conta (afeta todo mundo) ou só desta conversa. */
  scope: "conta" | "conversa" | "desconhecido";
};

const UNKNOWN: SendFailure = {
  code: null,
  title: "O WhatsApp recusou o envio",
  action: "Veja o erro técnico no final desta mensagem e confira a conta em WhatsApp → Contas.",
  scope: "desconhecido",
};

/** Regras por código da Meta — o que mais aparece no dia a dia. */
const BY_CODE: Record<string, Omit<SendFailure, "code">> = {
  "131047": {
    title: "Passou de 24h desde a última resposta do lead",
    action:
      "O WhatsApp só deixa mandar mensagem livre até 24h depois da última resposta da pessoa. Depois disso, só com template aprovado — use a aba Templates.",
    scope: "conversa",
  },
  "131026": {
    title: "O número não pode receber a mensagem",
    action:
      "Pode ser número sem WhatsApp, digitado errado ou que bloqueou a empresa. Confira o telefone na ficha do lead.",
    scope: "conversa",
  },
  "131056": {
    title: "Mensagens demais para este mesmo contato em pouco tempo",
    action: "Espere alguns minutos e evite disparar várias mensagens seguidas para a mesma pessoa.",
    scope: "conversa",
  },
  "130429": {
    title: "Limite de envios da conta atingido",
    action: "A conta passou do ritmo permitido pela Meta. Espere e reduza a cadência de disparos.",
    scope: "conta",
  },
  "131049": {
    title: "A Meta segurou a mensagem de marketing",
    action:
      "Não é erro de configuração: a Meta limita quantas mensagens de marketing cada pessoa recebe e corta quando a chance de engajamento é baixa. Espere pelo menos 24h antes de tentar de novo com a mesma pessoa. Aviso ligado a um compromisso já combinado costuma passar como template de utilidade.",
    scope: "conversa",
  },
  "131048": {
    title: "A Meta limitou a conta por qualidade/spam",
    action:
      "O número foi restringido por marcações de spam. Reduza os disparos e verifique a qualidade do número no painel da Meta.",
    scope: "conta",
  },
  "190": {
    title: "O acesso à conta do WhatsApp expirou",
    action:
      "O token de acesso venceu. Gere um novo no painel da Meta e atualize em WhatsApp → Contas. Enquanto isso, nenhuma mensagem sai.",
    scope: "conta",
  },
  "131031": {
    title: "A conta do WhatsApp está restrita pela Meta",
    action: "Verifique avisos e pendências da conta no painel da Meta (Business Manager).",
    scope: "conta",
  },
  "131042": {
    title: "Pendência de pagamento na conta da Meta",
    action: "Confira a forma de pagamento da conta de WhatsApp Business no painel da Meta.",
    scope: "conta",
  },
  "132001": {
    title: "O template não existe",
    action: "O modelo foi apagado ou o nome/idioma está diferente do aprovado na Meta.",
    scope: "conversa",
  },
  "132015": {
    title: "O template está pausado pela Meta",
    action: "Modelos com baixa qualidade são pausados. Ajuste o texto e reenvie para aprovação.",
    scope: "conversa",
  },
  "132000": {
    title: "As variáveis do template não batem",
    action: "A quantidade de variáveis enviadas é diferente da que o modelo aprovado espera.",
    scope: "conversa",
  },
  "133010": {
    title: "O número da empresa não está registrado",
    action: "Finalize o registro do número no painel da Meta e confira em WhatsApp → Contas.",
    scope: "conta",
  },
  "368": {
    title: "Conta bloqueada temporariamente por política",
    action:
      "A Meta bloqueou o número por violação de política. É preciso resolver no painel da Meta.",
    scope: "conta",
  },
};

/** Casos que não vêm com código, identificados pelo texto. */
const BY_TEXT: Array<{ match: RegExp; value: Omit<SendFailure, "code"> }> = [
  {
    match: /access[_ ]?token ausente|access token|session has expired|validating access token/i,
    value: BY_CODE["190"],
  },
  {
    match: /phone_number_id|provider_instance_id/i,
    value: {
      title: "A conta de WhatsApp está incompleta",
      action: "Falta o identificador do número. Preencha em WhatsApp → Contas.",
      scope: "conta",
    },
  },
  {
    match: /nenhuma conta de whatsapp configurada/i,
    value: {
      title: "Nenhuma conta de WhatsApp configurada",
      action: "Cadastre a conta em WhatsApp → Contas.",
      scope: "conta",
    },
  },
  {
    match: /lead sem telefone/i,
    value: {
      title: "O lead está sem telefone",
      action: "Preencha o telefone na ficha do lead antes de enviar.",
      scope: "conversa",
    },
  },
  {
    match: /24 hours|re-engagement/i,
    value: BY_CODE["131047"],
  },
  {
    match: /undeliverable/i,
    value: BY_CODE["131026"],
  },
  {
    match: /rate limit/i,
    value: BY_CODE["130429"],
  },
  {
    // A Meta manda esse texto às vezes sem o código junto.
    match: /healthy ecosystem|ecosystem engagement/i,
    value: BY_CODE["131049"],
  },
  {
    match: /fetch failed|network|ETIMEDOUT|ECONNRESET/i,
    value: {
      title: "Não deu para falar com o WhatsApp",
      action: "Falha de rede no momento do envio. Tente reenviar a mensagem.",
      scope: "desconhecido",
    },
  },
];

/** Lê o erro cru gravado na mensagem e devolve a explicação em português. */
export function explainWhatsappError(raw: string | null | undefined): SendFailure {
  const text = (raw ?? "").trim();
  if (!text) return UNKNOWN;

  const code =
    text.match(/\(#(\d+)\)/)?.[1] ?? text.match(/\b(?:code|código)[ :]*(\d{2,6})\b/i)?.[1] ?? null;
  if (code && BY_CODE[code]) return { code, ...BY_CODE[code] };

  for (const rule of BY_TEXT) {
    if (rule.match.test(text)) return { code, ...rule.value };
  }
  return { ...UNKNOWN, code };
}
