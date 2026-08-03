export const TOUCH_CHANNELS = [
  "whatsapp",
  "ligacao",
  "email",
  "linkedin",
  "sms",
  "presencial",
  "reuniao",
  "outro",
] as const;
export type TouchChannel = (typeof TOUCH_CHANNELS)[number];

export const TOUCH_CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
  linkedin: "LinkedIn",
  sms: "SMS",
  presencial: "Presencial",
  reuniao: "Reunião",
  outro: "Outro",
};

export const TOUCH_ACTIONS = [
  "mensagem_enviada",
  "ligacao_realizada",
  "ligacao_atendida",
  "audio_enviado",
  "email_enviado",
  "email_respondido",
  "mensagem_linkedin",
  "follow_up",
  "reuniao_realizada",
  "outro",
] as const;
export type TouchAction = (typeof TOUCH_ACTIONS)[number];

export const TOUCH_ACTION_LABEL: Record<string, string> = {
  mensagem_enviada: "Mensagem enviada",
  ligacao_realizada: "Ligação realizada",
  ligacao_atendida: "Ligação atendida",
  audio_enviado: "Áudio enviado",
  email_enviado: "E-mail enviado",
  email_respondido: "E-mail respondido",
  mensagem_linkedin: "Mensagem LinkedIn",
  follow_up: "Follow-up",
  reuniao_realizada: "Reunião realizada",
  outro: "Outro",
};

export const TOUCH_OUTCOMES = [
  "sem_resposta",
  "visualizou",
  "respondeu",
  "pediu_retorno",
  "agendou_reuniao",
  "sem_interesse",
  "numero_invalido",
  "caixa_postal",
  "ligacao_recusada",
  "contato_incorreto",
  "empresa_encerrada",
  "outros",
] as const;
export type TouchOutcome = (typeof TOUCH_OUTCOMES)[number];

export const TOUCH_OUTCOME_LABEL: Record<string, string> = {
  sem_resposta: "Sem resposta",
  visualizou: "Visualizou",
  respondeu: "Respondeu",
  pediu_retorno: "Pediu retorno",
  agendou_reuniao: "Agendou reunião",
  sem_interesse: "Não tem interesse",
  numero_invalido: "Número inválido",
  caixa_postal: "Caixa postal",
  ligacao_recusada: "Ligação recusada",
  contato_incorreto: "Contato incorreto",
  empresa_encerrada: "Empresa encerrada",
  outros: "Outros",
};

/** Resultados que contam como resposta efetiva do lead. */
export const RESPONSIVE_OUTCOMES: string[] = [
  "respondeu",
  "pediu_retorno",
  "agendou_reuniao",
  "sem_interesse",
  "email_respondido",
];

export const TOUCH_STAGE_SLUGS = ["qualificacao", "em_contato"];

export type TouchRules = {
  minTouchesBeforeDiscard: number;
  staleTouchDays: number;
  staleStageDays: number;
};

export const DEFAULT_TOUCH_RULES: TouchRules = {
  minTouchesBeforeDiscard: 6,
  staleTouchDays: 3,
  staleStageDays: 7,
};

export function channelLabel(v?: string | null) {
  return v ? (TOUCH_CHANNEL_LABEL[v] ?? v) : "—";
}
export function outcomeLabel(v?: string | null) {
  return v ? (TOUCH_OUTCOME_LABEL[v] ?? v) : "—";
}
export function actionLabel(v?: string | null) {
  return v ? (TOUCH_ACTION_LABEL[v] ?? v) : "—";
}

export function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86400000);
}
