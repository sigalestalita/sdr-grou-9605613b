/*
 * Para onde vai cada funil do RD CRM na espinha do nosso CRM.
 *
 *   Leads - Empresa [SDR]                  → lead do SDR (empresa)
 *   Leads - Alianças Estratégicas [SDR]    → lead do SDR (consultoria)
 *   [C] Vendas, Negócios dos Parceiros [PN],
 *   cross/up sell, indicação                → negócio
 *   Gestão da Carteira Comercial           → funil de conta (card = empresa)
 *   [CS] Novos / Em atendimento             → carteira do CS, etapa da jornada
 *   [CS] Gestão da Carteira                 → carteira do CS (todos os clientes
 *                                             atendidos, por CS responsável)
 *
 * Funil que não está nesta lista (ex.: FUNIL OUTBOUND - REPESCAGEM, Prospecção
 * de novos PN, Gestor de Canais) fica de fora da importação até a gestão
 * decidir o destino — melhor não importar que importar no lugar errado.
 */
export type DestinoRd =
  | { tipo: "lead"; leadType: "empresa" | "consultoria" }
  | { tipo: "negocio" }
  /** Funil ainda sem destino definido: não é importado. */
  | { tipo: "ignorar" }
  | { tipo: "conta"; pipelineSlug: "gestao-carteira-comercial" }
  /** journeyStage null: só entra na carteira do CS, sem mexer na etapa. */
  | { tipo: "cs"; journeyStage: "onboarding" | "ativacao" | "renovacao" | null };

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Etapa da jornada do CS para cada funil [CS] do RD. */
export const JORNADA_CS_POR_FUNIL: Array<[RegExp, "onboarding" | "ativacao"]> = [
  [/\bnovos?\b/, "onboarding"],
  [/em atendimento/, "ativacao"],
];

/** Funis cujos cards viram negócio. */
const FUNIS_DE_NEGOCIO: RegExp[] = [
  /^(\[c\] )?vendas?$/,
  /negocios dos parceiros/,
  /cross ?sell|up ?sell|recompra|indicac|indique/,
];

export function destinoDoFunilRd(pipeline: string | null | undefined): DestinoRd {
  const p = norm(pipeline);
  if (p.startsWith("[cs]")) {
    for (const [re, journeyStage] of JORNADA_CS_POR_FUNIL)
      if (re.test(p)) return { tipo: "cs", journeyStage };
    // [CS] Gestão da Carteira (ou outro [CS]): é a carteira inteira do CS.
    return { tipo: "cs", journeyStage: null };
  }
  if (p.includes("[sdr]") || p.startsWith("leads")) {
    return {
      tipo: "lead",
      leadType: /alianca|consultoria|partner/.test(p) ? "consultoria" : "empresa",
    };
  }
  if (/gestao da carteira/.test(p))
    return { tipo: "conta", pipelineSlug: "gestao-carteira-comercial" };
  if (FUNIS_DE_NEGOCIO.some((re) => re.test(p))) return { tipo: "negocio" };
  return { tipo: "ignorar" };
}

/** Slug estável para etapas criadas a partir do nome no RD. */
export function slugDaEtapa(nome: string): string {
  return (
    norm(nome)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "etapa"
  );
}
