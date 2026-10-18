/*
 * Para onde vai cada funil do RD CRM na espinha do nosso CRM.
 *
 *   Leads - Empresa [SDR]                  → lead do SDR (empresa)
 *   Leads - Alianças Estratégicas [SDR]    → lead do SDR (consultoria)
 *   Vendas (e cross/up sell, indicação)     → negócio
 *   Gestão da Carteira Comercial           → funil de conta (card = empresa)
 *   [CS] Novos / Em atendimento             → carteira do CS, etapa da jornada
 *   [CS] Gestão da Carteira                 → carteira do CS (todos os clientes
 *                                             atendidos, por CS responsável)
 *
 * Funil desconhecido vira negócio, que é o que a importação fazia antes.
 */
export type DestinoRd =
  | { tipo: "lead"; leadType: "empresa" | "consultoria" }
  | { tipo: "negocio" }
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
  return { tipo: "negocio" };
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
