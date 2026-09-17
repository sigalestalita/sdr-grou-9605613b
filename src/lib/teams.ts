/*
 * Módulos, times/áreas e tipos de acesso.
 *
 *  - MÓDULO (AppTeam): o que o sistema tem — "comercial" (SDR + executivos) e
 *    "cs" (Customer Success). É por módulo que rotas e menu são liberados.
 *  - TIME / ÁREA: cadastro livre (tabela teams). Cada time habilita um módulo
 *    (ou nenhum, se for área de apoio). "Comercial" e "Customer Success" vêm
 *    de fábrica; a gestão pode criar outros (ex.: "CS Enterprise" → módulo cs).
 *  - TIPO DE ACESSO: o que a pessoa faz naquele time (user_teams.access).
 *    Uma pessoa pode estar em vários times com tipos diferentes — analista de
 *    CS e executiva comercial, sem ser SDR.
 */
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

/** Cor de destaque por módulo (classes utilitárias já existentes no tema). */
export const TEAM_TONE: Record<AppTeam, string> = {
  comercial: "border-primary/40 bg-primary/10 text-primary",
  cs: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
};

// ---------------------------------------------------------------------------
// Times / áreas
// ---------------------------------------------------------------------------
export type Team = {
  slug: string;
  nome: string;
  descricao: string | null;
  modulo: AppTeam | null;
  cor: string;
  ativo: boolean;
  ordem: number;
};

export type Membership = { team: string; access: string[] };

export const MODULE_OPTIONS: Array<{ value: AppTeam | "none"; label: string; hint: string }> = [
  {
    value: "comercial",
    label: "Comercial / SDR",
    hint: "Pipeline, inbox, cadência e carteira fechada",
  },
  { value: "cs", label: "Customer Success", hint: "Empresas, sinaleira, tarefas e alertas" },
  { value: "none", label: "Área de apoio", hint: "Sem módulo próprio — só organiza pessoas" },
];

/** Cores disponíveis para um time (badge/chip). */
export const TEAM_COLORS: Record<string, { label: string; chip: string; dot: string }> = {
  sky: {
    label: "Azul",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  emerald: {
    label: "Verde",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  violet: {
    label: "Roxo",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  amber: {
    label: "Âmbar",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  rose: {
    label: "Rosa",
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  slate: {
    label: "Cinza",
    chip: "border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-500",
  },
};

export function teamChipClass(team: Pick<Team, "cor">): string {
  return TEAM_COLORS[team.cor]?.chip ?? TEAM_COLORS.slate.chip;
}

// ---------------------------------------------------------------------------
// Tipos de acesso por módulo (mesma tabela de public.team_access_types)
// ---------------------------------------------------------------------------
export type AccessType = { value: string; label: string; hint: string };

export const ACCESS_TYPES: Record<AppTeam | "none", AccessType[]> = {
  comercial: [
    { value: "sdr", label: "SDR", hint: "Pipeline de leads, inbox, agenda de FUPs e cadência" },
    {
      value: "executivo",
      label: "Executivo comercial",
      hint: "Carteira fechada: Início, Empresas e Tarefas que o CS aciona",
    },
    { value: "gestao", label: "Gestão", hint: "Vê e configura tudo, em todos os módulos" },
  ],
  cs: [
    {
      value: "analista",
      label: "Analista de CS",
      hint: "Empresas, kanban semanal, cadência, canais e tarefas",
    },
    { value: "gestao", label: "Gestão", hint: "Vê e configura tudo, em todos os módulos" },
  ],
  none: [
    { value: "membro", label: "Membro", hint: "Faz parte da área, sem módulo no sistema" },
    { value: "gestao", label: "Gestão", hint: "Vê e configura tudo, em todos os módulos" },
  ],
};

export function accessTypesFor(team: Pick<Team, "modulo">): AccessType[] {
  return ACCESS_TYPES[team.modulo ?? "none"];
}

export function accessLabel(value: string): string {
  for (const list of Object.values(ACCESS_TYPES)) {
    const hit = list.find((a) => a.value === value);
    if (hit) return hit.label;
  }
  return value;
}

/**
 * Módulos que a pessoa enxerga a partir dos vínculos:
 *  - time do módulo cs → "cs" (qualquer tipo de acesso)
 *  - time do módulo comercial → "comercial" só com acesso sdr ou gestao
 *    (executivo entra pelos objetos Início/Empresas/Tarefas, não pelo SDR)
 */
export function modulesFromMemberships(memberships: Membership[], teams: Team[]): AppTeam[] {
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const out = new Set<AppTeam>();
  for (const m of memberships) {
    const t = bySlug.get(m.team);
    if (!t || !t.ativo || !t.modulo) continue;
    if (t.modulo === "cs") out.add("cs");
    else if (m.access.includes("sdr") || m.access.includes("gestao")) out.add("comercial");
  }
  return [...out];
}

/*
 * Módulos do sistema e quem entra em cada rota.
 *
 *  - SDR (módulo comercial, acesso sdr): pipeline de leads, inbox WhatsApp,
 *    agenda de FUPs, cadência, playbook SDR, performance — o produto original.
 *  - Executivo (acesso executivo): a carteira de clientes que ele fechou —
 *    Início, Empresas e Tarefas do CS.
 *  - CS (módulo cs): tudo do Customer Success.
 *
 * Rotas não listadas são livres. O inbox de WhatsApp é compartilhado entre
 * SDR e CS — a visibilidade real é por conta (whatsapp_accounts).
 */
type RouteAccess = { prefix: string; teams: AppTeam[]; roles?: AppRole[] };

const ROUTE_ACCESS: RouteAccess[] = [
  { prefix: "/cs", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/empresas", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/cs-follow-ups", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/cs-consultorias", teams: ["cs"] },
  { prefix: "/cs-whatsapp", teams: ["cs"] },
  { prefix: "/cs-tickets", teams: ["cs"] },
  { prefix: "/cs-configuracoes", teams: ["cs"] },
  { prefix: "/cs-dashboard", teams: ["cs"] },
  { prefix: "/cs-cadencia", teams: ["cs"] },
  { prefix: "/cs-kanban", teams: ["cs"] },
  { prefix: "/cs-playbook", teams: ["cs"] },
  { prefix: "/cs-agenda", teams: ["cs"] },
  { prefix: "/cs-emails", teams: ["cs"] },
  { prefix: "/cs-integracoes", teams: ["cs"], roles: ["executivo"] },
  { prefix: "/jornada", teams: ["comercial", "cs"], roles: ["executivo"] },
  { prefix: "/negocio", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/comercial-analise", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/comercial", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/comercial-pipeline", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/comercial-metas", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/comercial-agenda", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/dashboard", teams: ["comercial"] },
  { prefix: "/kanban", teams: ["comercial"] },
  { prefix: "/lead", teams: ["comercial"], roles: ["executivo"] },
  { prefix: "/agenda", teams: ["comercial"] },
  { prefix: "/cadencia", teams: ["comercial"] },
  { prefix: "/leads-analytics", teams: ["comercial"] },
  { prefix: "/analytics-chat", teams: ["comercial"] },
  { prefix: "/playbook", teams: ["comercial"] },
  // Importação da base do RD: gestão apenas, e o servidor confere de novo.
  { prefix: "/importar-rd", teams: ["comercial", "cs"] },
];

function matchRoute(pathname: string): RouteAccess | null {
  // prefixo mais longo primeiro: "/cs-kanban" antes de "/cs"
  const hits = ROUTE_ACCESS.filter(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  return hits[0] ?? null;
}

/** Módulo "dono" da rota (para o rótulo da tela de módulo restrito). */
export function teamForPath(pathname: string): AppTeam | null {
  return matchRoute(pathname)?.teams[0] ?? null;
}

/** Quem pode abrir a rota: gestão sempre; senão, por módulo ou tipo de acesso. */
export function canOpenPath(
  pathname: string,
  who: { teams: string[]; roles: string[]; canAccessAll: boolean },
): boolean {
  const r = matchRoute(pathname);
  if (!r || who.canAccessAll) return true;
  if (r.teams.some((t) => who.teams.includes(t))) return true;
  return (r.roles ?? []).some((x) => who.roles.includes(x));
}
