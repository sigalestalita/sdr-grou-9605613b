/*
 * De onde o lead veio, em português.
 *
 * O campo source guarda o valor técnico que quem gravou escolheu
 * ("whatsapp_inbound"), e ele aparecia cru no filtro do kanban e na exportação.
 */

/*
 * Origens que significam "entrou direto pelo WhatsApp".
 *
 * whatsapp_inbound é o lead de clique em anúncio, que chega só com telefone.
 * whatsapp_espelho é o contato do número pessoal de um SDR que virou lead.
 */
export const VINDO_DO_WHATSAPP = new Set(["whatsapp_inbound", "whatsapp_espelho"]);

const ROTULO_DA_ORIGEM: Record<string, string> = {
  whatsapp_inbound: "WhatsApp (clique no anúncio)",
  whatsapp_espelho: "WhatsApp (número do time)",
  whatsapp_ai_test: "WhatsApp (teste da IA)",
};

export function rotuloDaOrigem(src: string): string {
  return ROTULO_DA_ORIGEM[src] ?? src;
}

/** Veio do WhatsApp e a IA ainda não preencheu o tipo. */
export function aguardandoQualificacaoDaIa(lead: {
  source?: string | null;
  lead_type?: string | null;
}): boolean {
  return VINDO_DO_WHATSAPP.has((lead.source ?? "").trim()) && !lead.lead_type;
}
