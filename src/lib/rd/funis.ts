/*
 * Para onde vai cada funil do RD CRM na espinha do nosso CRM.
 *
 *   Leads - Empresa [SDR]                  → lead do SDR (empresa)
 *   Leads - Alianças Estratégicas [SDR]    → lead do SDR (consultoria)
 *   Vendas (e cross/up sell, indicação)     → negócio
 *   Gestão da Carteira Comercial           → funil de conta (card = empresa)
 *   [CS] Novos / Em atendimento / Gestão da Carteira → jornada do CS
 *
 * Funil desconhecido vira negócio, que é o que a importação fazia antes.
 */
export type DestinoRd =
  | { tipo: "lead"; leadType: "empresa" | "consultoria" }
  | { tipo: "negocio" }
  | { tipo: "conta"; pipelineSlug: "gestao-carteira-comercial" }
  | { tipo: "cs"; journeyStage: "onboarding" | "ativacao" | "renovacao" };

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Etapa da jornada do CS para cada funil [CS] do RD. */
export const JORNADA_CS_POR_FUNIL: Array<[RegExp, "onboarding" | "ativacao" | "renovacao"]> = [
  [/\bnovos?\b/, "onboarding"],
  [/em atendimento/, "ativacao"],
  [/gestao da carteira/, "renovacao"],
];

export function destinoDoFunilRd(pipeline: string | null | undefined): DestinoRd {
  const p = norm(pipeline);
  if (p.startsWith("[cs]")) {
    for (const [re, journeyStage] of JORNADA_CS_POR_FUNIL)
      if (re.test(p)) return { tipo: "cs", journeyStage };
    return { tipo: "cs", journeyStage: "ativacao" };
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
