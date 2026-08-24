export const CS_FOLLOWUP_OUTCOMES = [
  "atendimento_concluido",
  "sem_resposta",
  "reuniao_marcada",
  "aguardando_cliente",
  "sem_necessidade",
] as const;
export type CsFollowUpOutcome = (typeof CS_FOLLOWUP_OUTCOMES)[number];

export const CS_FOLLOWUP_OUTCOME_LABEL: Record<string, string> = {
  atendimento_concluido: "Atendimento concluído",
  sem_resposta: "Tentativa sem resposta",
  reuniao_marcada: "Reunião marcada",
  aguardando_cliente: "Aguardando retorno do cliente",
  sem_necessidade: "Sem necessidade de ação",
};

export const CS_FOLLOWUP_CHANNELS = [
  "whatsapp",
  "email",
  "ligacao",
  "reuniao",
  "observacao",
] as const;
export type CsFollowUpChannel = (typeof CS_FOLLOWUP_CHANNELS)[number];

export const CS_FOLLOWUP_CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  ligacao: "Ligação",
  reuniao: "Reunião",
  observacao: "Observação",
};
