export const TEAMS = ["comercial", "cs"] as const;
export type AppTeam = (typeof TEAMS)[number];

export const ROLES = ["super_admin", "gestao", "executivo", "sdr"] as const;
export type AppRole = (typeof ROLES)[number];

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

/*
 * Módulos do sistema e quem entra em cada rota.
 *
 *  - SDR (time comercial): pipeline de leads, inbox WhatsApp, agenda de FUPs,
 *    cadência, playbook SDR, performance — o produto original, intocado.
 *  - Comercial (papel executivo): a carteira de clientes que ele fechou —
 *    Início, Empresas e Tarefas do CS, além do que já via como time comercial.
 *  - CS (time cs): tudo do Customer Success.
 *
 * Rotas não listadas são livres. O inbox de WhatsApp é compartilhado entre
 * SDR e CS — a visibilidade real é por conta (whatsapp_accounts).
 */
type RouteAccess = { prefix: string; teams: AppTeam[]; roles?: AppRole[] };

const ROUTE_ACCESS: RouteAccess[] = [
  { prefix: "/inicio", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/cs", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/empresas", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/cs-follow-ups", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/cs-configuracoes", teams: ["cs"] },
  { prefix: "/cs-dashboard", teams: ["cs"] },
  { prefix: "/cs-cadencia", teams: ["cs"] },
  { prefix: "/cs-kanban", teams: ["cs"] },
  { prefix: "/cs-playbook", teams: ["cs"] },
  { prefix: "/cs-agenda", teams: ["cs"] },
  { prefix: "/cs-emails", teams: ["cs"] },
  { prefix: "/cs-integracoes", teams: ["cs"] },
  { prefix: "/dashboard", teams: ["comercial"] },
  { prefix: "/kanban", teams: ["comercial"] },
  { prefix: "/lead", teams: ["comercial"] },
  { prefix: "/agenda", teams: ["comercial"] },
  { prefix: "/cadencia", teams: ["comercial"] },
  { prefix: "/leads-analytics", teams: ["comercial"] },
  { prefix: "/analytics-chat", teams: ["comercial"] },
  { prefix: "/playbook", teams: ["comercial"] },
];

function matchRoute(pathname: string): RouteAccess | null {
  // prefixo mais longo primeiro: "/cs-kanban" antes de "/cs"
  const hits = ROUTE_ACCESS.filter(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  return hits[0] ?? null;
}

/** Time "dono" da rota (para o rótulo da tela de módulo restrito). */
export function teamForPath(pathname: string): AppTeam | null {
  return matchRoute(pathname)?.teams[0] ?? null;
}

/** Quem pode abrir a rota: gestão sempre; senão, por time ou papel. */
export function canOpenPath(
  pathname: string,
  who: { teams: string[]; roles: string[]; canAccessAll: boolean },
): boolean {
  const r = matchRoute(pathname);
  if (!r || who.canAccessAll) return true;
  if (r.teams.some((t) => who.teams.includes(t))) return true;
  return (r.roles ?? []).some((x) => who.roles.includes(x));
}
