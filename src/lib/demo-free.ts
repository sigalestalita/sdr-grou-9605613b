export type DemoFreeKey =
  | "sim"
  | "nao"
  | "esta_semana"
  | "proxima_semana"
  | "duas_semanas"
  | "pesquisando";

export const DEMO_FREE_LABEL: Record<DemoFreeKey, string> = {
  sim: "Demo Free: sim",
  nao: "Demo Free: não",
  esta_semana: "Ainda nesta semana",
  proxima_semana: "Próxima semana",
  duas_semanas: "Nas próximas 2 semanas",
  pesquisando: "Ainda estou pesquisando",
};

export const DEMO_FREE_OPTIONS: DemoFreeKey[] = [
  "sim",
  "nao",
  "esta_semana",
  "proxima_semana",
  "duas_semanas",
  "pesquisando",
];

/** Verde para intenção de demo, âmbar para pesquisa, cinza para "não". */
export const DEMO_FREE_TONE: Record<DemoFreeKey, string> = {
  sim: "border-emerald-500 text-emerald-600 dark:text-emerald-400",
  nao: "border-muted-foreground/40 text-muted-foreground",
  esta_semana: "border-emerald-500 text-emerald-600 dark:text-emerald-400",
  proxima_semana: "border-emerald-500 text-emerald-600 dark:text-emerald-400",
  duas_semanas: "border-sky-500 text-sky-600 dark:text-sky-400",
  pesquisando: "border-amber-500 text-amber-600 dark:text-amber-400",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Resolve a resposta da coluna (M) "Demo Free" a partir do texto bruto + fallback booleano. */
export function resolveDemoFree(lead: {
  demo_free?: boolean | null;
  form_payload?: unknown;
}): DemoFreeKey | null {
  const raw = (lead.form_payload as { demo_free_raw?: string | null } | null)?.demo_free_raw ?? null;
  if (raw) {
    const t = norm(raw);
    if (/^(sim|s|yes|y|true|1|x)$/.test(t)) return "sim";
    if (/^(nao|n|no|false|0)$/.test(t)) return "nao";
    if (t.includes("esta semana") || t.includes("nesta semana")) return "esta_semana";
    if (t.includes("proxima semana")) return "proxima_semana";
    if (t.includes("2 semanas") || t.includes("duas semanas")) return "duas_semanas";
    if (t.includes("pesquisando") || t.includes("mais informacoes")) return "pesquisando";
  }
  if (lead.demo_free === true) return "sim";
  if (lead.demo_free === false) return "nao";
  return null;
}
