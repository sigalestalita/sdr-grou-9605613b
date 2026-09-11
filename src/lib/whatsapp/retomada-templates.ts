/*
 * Os três templates de retomada, versionados em código.
 *
 * Existem para quando a janela de 24h fecha: fora dela o WhatsApp só entrega
 * template aprovado. Ficam aqui, e não só na migration, para a aba Templates
 * conseguir criá-los com um clique — sem depender de alguém aplicar SQL.
 *
 * Formato: o corpo usa variável por nome; na hora de enviar para a Meta o
 * sistema converte para {{1}}, {{2}}… seguindo a ordem de "variables". Só
 * usamos primeiro_nome, porque "empresa" vem vazia em lead pessoa física e
 * variável vazia é motivo de recusa na Meta.
 *
 * Todos têm botão de resposta rápida de propósito: o toque no botão conta como
 * mensagem recebida e reabre a janela de 24h, devolvendo a conversa livre sem
 * gastar outro template.
 */

export type RetomadaTemplate = {
  name: string;
  provider_template_name: string;
  category: "marketing" | "utility";
  language: string;
  body: string;
  variables: string[];
  footer_text: string | null;
  buttons: Array<{ type: "QUICK_REPLY"; text: string }>;
  /** Quando o SDR usa este modelo. */
  quando: string;
};

export const RETOMADA_TEMPLATES: RetomadaTemplate[] = [
  {
    name: "Retomada de contato",
    provider_template_name: "retomada_contato",
    category: "marketing",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, aqui é a Grou. Você pediu para conhecer o PDA Assessment, nossa análise de perfil comportamental para gestão de pessoas, e ficamos sem retorno seu.\n\n" +
      "Quer retomar a conversa de onde paramos?",
    variables: ["primeiro_nome"],
    footer_text: "Se preferir, é só responder por aqui",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero retomar" },
      { type: "QUICK_REPLY", text: "Não quero contato" },
    ],
    quando: "O lead esfriou e ficou sem resposta",
  },
  {
    name: "Remarcar reunião",
    provider_template_name: "remarcar_reuniao",
    category: "utility",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, tudo bem? Não consegui falar com você no horário que tínhamos combinado para apresentar o PDA Assessment.\n\n" +
      "Podemos remarcar? Me diga um dia e um horário que funcionem melhor para você.",
    variables: ["primeiro_nome"],
    footer_text: null,
    buttons: [
      { type: "QUICK_REPLY", text: "Quero remarcar" },
      { type: "QUICK_REPLY", text: "Não tenho interesse" },
    ],
    quando: "Agenda combinada em que o lead não apareceu",
  },
  {
    name: "Envio de material do PDA",
    provider_template_name: "envio_material_pda",
    category: "marketing",
    language: "pt_BR",
    body:
      "Oi {{primeiro_nome}}, separei um vídeo curto que mostra como o PDA Assessment mapeia o perfil comportamental do time e ajuda nas decisões de gestão.\n\n" +
      "Posso te mandar o material por aqui?",
    variables: ["primeiro_nome"],
    footer_text: "Se preferir, é só responder por aqui",
    buttons: [
      { type: "QUICK_REPLY", text: "Pode mandar" },
      { type: "QUICK_REPLY", text: "Agora não" },
    ],
    quando: "Abrir espaço para mandar o vídeo do PDA",
  },
];

/** Limites da Meta que, se estourados, viram recusa na análise. */
export function validateRetomadaTemplate(t: RetomadaTemplate): string[] {
  const erros: string[] = [];
  const corpo = t.body.trim();
  if (corpo.length > 1024) erros.push("corpo passa de 1024 caracteres");
  if (corpo.startsWith("{{")) erros.push("corpo não pode começar com variável");
  if (corpo.endsWith("}}")) erros.push("corpo não pode terminar com variável");
  if ((t.footer_text ?? "").length > 60) erros.push("rodapé passa de 60 caracteres");
  for (const b of t.buttons) {
    if (b.text.length > 25) erros.push(`botão "${b.text}" passa de 25 caracteres`);
  }
  for (const v of t.variables) {
    if (!corpo.includes(`{{${v}}}`)) erros.push(`variável ${v} não aparece no corpo`);
  }
  return erros;
}
