export const TEAMS = ["comercial", "cs"] as const;
export type AppTeam = (typeof TEAMS)[number];

export const TEAM_LABEL: Record<AppTeam, string> = {
  comercial: "Comercial / SDR",
  cs: "Customer Success",
};

export const TEAM_DESCRIPTION: Record<AppTeam, string> = {
  comercial: "Pipeline de leads, inbox WhatsApp, cadência e performance",
  cs: "Carteira de clientes, sinaleira e alertas de Customer Success",
};

/** Cor de destaque por time (classes utilitárias já existentes no tema). */
export const TEAM_TONE: Record<AppTeam, string> = {
  comercial: "border-primary/40 bg-primary/10 text-primary",
  cs: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
};

/**
 * Prefixos de rota que pertencem a cada time. Rotas não listadas são livres.
 * O inbox/disparos de WhatsApp é compartilhado entre Comercial e CS — a
 * visibilidade real é feita por conta (whatsapp_accounts.visible_to_user_ids).
 */
const ROUTE_TEAMS: { prefix: string; team: AppTeam }[] = [
  { prefix: "/cs", team: "cs" },
  { prefix: "/cs-agenda", team: "cs" },
  { prefix: "/cs-emails", team: "cs" },
  { prefix: "/cs-integracoes", team: "cs" },
  { prefix: "/dashboard", team: "comercial" },
  { prefix: "/kanban", team: "comercial" },
  { prefix: "/lead", team: "comercial" },
  { prefix: "/agenda", team: "comercial" },
  { prefix: "/cadencia", team: "comercial" },
  { prefix: "/leads-analytics", team: "comercial" },
  { prefix: "/analytics-chat", team: "comercial" },
];


export function teamForPath(pathname: string): AppTeam | null {
  const match = ROUTE_TEAMS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return match?.team ?? null;
}
