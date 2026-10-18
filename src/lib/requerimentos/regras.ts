/*
 * Requerimento de serviço e licença PDA — parte pura, sem banco.
 */

export const STATUS_REQUERIMENTO = [
  { v: "solicitado", l: "Solicitado pelo comercial" },
  { v: "em_preparacao", l: "Em preparação (ADM)" },
  { v: "agendado", l: "Agendado" },
  { v: "em_execucao", l: "Em execução" },
  { v: "concluido", l: "Concluído" },
  { v: "cancelado", l: "Cancelado" },
] as const;
export type StatusRequerimento = (typeof STATUS_REQUERIMENTO)[number]["v"];

export type ItemLogistica = {
  grupo: "online" | "presencial" | "assessment";
  item: string;
  necessario: boolean | null;
  responsavel: string;
  observacao: string;
};

/** Os itens do modelo de requerimento usado hoje (planilha do ADM). */
const ITENS: Record<ItemLogistica["grupo"], string[]> = {
  online: [
    "Envio de instruções",
    "Envio de link de avaliação",
    "Acompanhamento de preenchimento",
    "Envio de relatórios",
    "Envio do link/invite do treinamento",
    "Lista de participantes recebida",
  ],
  presencial: [
    "Hospedagem",
    "Deslocamento",
    "Local do treinamento",
    "Entrega dos materiais",
    "Impressão de relatórios",
    "Materiais impressos (avisar a Lauren com 20 dias de antecedência)",
    "Lista de participantes recebida",
  ],
  assessment: ["Compatibilidade com cargo", "Cargo na plataforma", "Dashboard de entrega"],
};

export function logisticaPadrao(
  formato: "online" | "presencial" | "hibrido" | null,
  comAssessment = false,
): ItemLogistica[] {
  const grupos: ItemLogistica["grupo"][] =
    formato === "presencial"
      ? ["presencial"]
      : formato === "hibrido"
        ? ["online", "presencial"]
        : ["online"];
  if (comAssessment) grupos.push("assessment");
  return grupos.flatMap((grupo) =>
    ITENS[grupo].map((item) => ({
      grupo,
      item,
      necessario: null,
      responsavel: "",
      observacao: "",
    })),
  );
}

/** Itens marcados como necessários e ainda sem responsável. */
export function logisticaPendente(itens: ItemLogistica[]): ItemLogistica[] {
  return itens.filter((i) => i.necessario === true && !i.responsavel.trim());
}

// ---------------------------------------------------------------------------
// Licença PDA: a PDA responde em ~2 dias úteis e não avisa.
// ---------------------------------------------------------------------------
/** Dias úteis (seg–sex) completos entre duas datas. */
export function diasUteisEntre(de: Date, ate: Date): number {
  if (ate <= de) return 0;
  let n = 0;
  const d = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()));
  const fim = new Date(Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate()));
  while (d < fim) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n;
}

export const PRAZO_PDA_DIAS_UTEIS = 2;

/** Solicitada há 2 dias úteis ou mais e não liberada: hora de ir olhar. */
export function licencaParaConferir(
  l: { status: string; solicitado_em: string | null },
  agora = new Date(),
): boolean {
  if (l.status !== "solicitado" || !l.solicitado_em) return false;
  return diasUteisEntre(new Date(l.solicitado_em), agora) >= PRAZO_PDA_DIAS_UTEIS;
}
