/*
 * Masterclasses — principal entrega proativa do CS (45 min, gratuitas,
 * conduzidas pelos analistas). Catálogo, regra de oferta por cor/tempo e
 * marcos de sucesso vêm de cs_settings.masterclass; aqui ficam os padrões
 * do playbook da Marcela e a lógica pura (sugestão + marcos), testável.
 */
import type { CsSignal } from "@/lib/cs-types";

export type MasterclassModule = {
  id: number;
  nome: string;
  descricao: string;
  /** Módulo indicado quando o cliente tem esta tag_uso. */
  tag_uso?: "recrutamento" | "desenvolvimento";
};

export const DIAG_CAUSES = ["analista_novo", "falta_projeto", "nao_ve_valor", "outro"] as const;
export type DiagCause = (typeof DIAG_CAUSES)[number];
export const DIAG_CAUSE_LABEL: Record<DiagCause, string> = {
  analista_novo: "Analista novo / recém-certificado",
  falta_projeto: "Falta de projeto concreto",
  nao_ve_valor: "Não vê valor",
  outro: "Outra causa",
};

export type MasterclassRule = {
  id: string;
  cor: "verde" | "amarelo" | "vermelho" | "qualquer";
  /** Semanas seguidas na cor (inclusive). */
  semanas_min?: number;
  semanas_max?: number;
  /** Vermelho: causa apurada no diagnóstico. */
  causa?: DiagCause;
  /** Marco de contrato: mês N desde o início. */
  mes_contrato?: number;
  /** Analista PDA novo registrado há até N dias (tag_analista mudou). */
  analista_novo_dias?: number;
  /** Módulos sugeridos; vazio + usar_tag_uso = módulo da tag_uso. */
  modulos: number[];
  usar_tag_uso?: boolean;
  motivo: string;
};

export type SuccessRule = { modulos: number[]; participacoes: number; usos: number };

export type MasterclassConfig = {
  modulos: MasterclassModule[];
  regras: MasterclassRule[];
  sucesso: { primeiro: SuccessRule; segundo: SuccessRule };
};

export const DEFAULT_MASTERCLASS_CONFIG: MasterclassConfig = {
  modulos: [
    {
      id: 1,
      nome: "Fundamentos do PDA e Autoconhecimento",
      descricao:
        "Clientes novos, com analista recém-certificado ou que voltaram após período de baixo uso.",
    },
    {
      id: 2,
      nome: "Seleção e Onboarding Inteligente",
      descricao:
        "Clientes com tag_uso = recrutamento que ainda não exploram o PDA no processo seletivo de forma estruturada.",
      tag_uso: "recrutamento",
    },
    {
      id: 3,
      nome: "Desenvolvimento e Engajamento",
      descricao:
        "Clientes com tag_uso = desenvolvimento que querem usar o PDA para PDI e planos de crescimento.",
      tag_uso: "desenvolvimento",
    },
    {
      id: 4,
      nome: "Demanda de Equipes e Cultura Organizacional",
      descricao:
        "Clientes com equipes maiores ou projetos de cultura que já têm volume de dados na plataforma.",
    },
    {
      id: 5,
      nome: "Liderança e Sucessão",
      descricao: "Clientes com programas formais de liderança ou planejamento de sucessão.",
    },
    {
      id: 6,
      nome: "RH como Consultor Interno",
      descricao:
        "Clientes maduros — geralmente acima de 6 meses de uso — que querem o PDA como ferramenta estratégica.",
    },
  ],
  regras: [
    {
      id: "verde-3-4",
      cor: "verde",
      semanas_min: 3,
      semanas_max: 4,
      modulos: [4, 5],
      motivo: "Cliente em alta — conversa estratégica",
    },
    {
      id: "verde-8",
      cor: "verde",
      semanas_min: 8,
      modulos: [6],
      motivo: "Cliente consolidado — aprofundar uso",
    },
    {
      id: "amarelo-3",
      cor: "amarelo",
      semanas_min: 3,
      semanas_max: 7,
      modulos: [],
      usar_tag_uso: true,
      motivo: "Reativar uso com conteúdo relevante (primeira abordagem)",
    },
    {
      id: "amarelo-8",
      cor: "amarelo",
      semanas_min: 8,
      modulos: [4],
      motivo: "Ampliar perspectiva do uso",
    },
    {
      id: "vermelho-analista",
      cor: "vermelho",
      causa: "analista_novo",
      modulos: [1],
      motivo: "Capacitar o novo analista",
    },
    {
      id: "vermelho-projeto",
      cor: "vermelho",
      causa: "falta_projeto",
      modulos: [2, 3],
      motivo: "Criar novo caso de uso concreto",
    },
    {
      id: "vermelho-valor",
      cor: "vermelho",
      causa: "nao_ve_valor",
      modulos: [6],
      motivo: "Elevar a conversa para estratégia",
    },
    {
      id: "analista-novo",
      cor: "qualquer",
      analista_novo_dias: 60,
      modulos: [1],
      motivo: "Analista PDA novo registrado — capacitar o novo analista",
    },
    {
      id: "mes-3",
      cor: "qualquer",
      mes_contrato: 3,
      modulos: [],
      usar_tag_uso: true,
      motivo: "Marco da jornada (mês 3 do contrato)",
    },
    {
      id: "mes-6",
      cor: "qualquer",
      mes_contrato: 6,
      modulos: [4, 5],
      motivo: "Marco de maturidade (mês 6 do contrato)",
    },
  ],
  sucesso: {
    primeiro: { modulos: [1, 2, 3], participacoes: 2, usos: 1 },
    segundo: { modulos: [5], participacoes: 1, usos: 1 },
  },
};

export type Participation = {
  module_id: number;
  held_at: string;
  used_in_project: boolean;
  used_at?: string | null;
};

export type MasterclassSuggestion = {
  moduleId: number;
  moduleName: string;
  motivo: string;
  ruleId: string;
};

/** Semanas seguidas na cor atual (histórico do mais antigo ao mais recente; ignora sem_dado). */
export function weeksInColor(history: string[]): { signal: CsSignal | "sem_dado"; weeks: number } {
  const h = history.filter((s) => s && s !== "sem_dado");
  if (!h.length) return { signal: "sem_dado", weeks: 0 };
  const last = h[h.length - 1];
  let n = 1;
  for (let i = h.length - 2; i >= 0 && h[i] === last; i--) n++;
  return { signal: last as CsSignal, weeks: n };
}

/** Mês do contrato (1 = primeiro mês). */
export function contractMonth(
  contractStart: string | null | undefined,
  now = new Date(),
): number | null {
  if (!contractStart) return null;
  const start = new Date(contractStart);
  if (Number.isNaN(start.getTime()) || start > now) return null;
  return Math.floor((now.getTime() - start.getTime()) / (30.44 * 86400000)) + 1;
}

function modulesForTag(tag: string | null | undefined, cfg: MasterclassConfig): number[] {
  const byTag = (t: string) => cfg.modulos.filter((m) => m.tag_uso === t).map((m) => m.id);
  if (tag === "ambos") return [...byTag("recrutamento"), ...byTag("desenvolvimento")];
  if (tag === "recrutamento" || tag === "desenvolvimento") return byTag(tag);
  return [];
}

/** Módulos a oferecer agora, pela regra de cor/tempo, tirando os já realizados. */
export function suggestMasterclasses(
  input: {
    history: string[];
    tagUso: string | null | undefined;
    diagCause: string | null | undefined;
    contractStart: string | null | undefined;
    /** Dias desde o registro do analista PDA mais recente (null = nenhum). */
    newAnalystDays?: number | null;
    now?: Date;
  },
  participations: Participation[],
  cfg: MasterclassConfig = DEFAULT_MASTERCLASS_CONFIG,
): MasterclassSuggestion[] {
  const { signal, weeks } = weeksInColor(input.history);
  const month = contractMonth(input.contractStart, input.now);
  const done = new Set(participations.map((p) => p.module_id));
  const out: MasterclassSuggestion[] = [];
  const seen = new Set<number>();
  for (const r of cfg.regras) {
    let ok = false;
    if (r.analista_novo_dias != null)
      ok =
        input.newAnalystDays != null &&
        input.newAnalystDays <= r.analista_novo_dias &&
        (r.cor === "qualquer" || r.cor === signal);
    else if (r.mes_contrato != null)
      ok = month === r.mes_contrato && (r.cor === "qualquer" || r.cor === signal);
    else if (r.causa) ok = signal === r.cor && input.diagCause === r.causa;
    else if (r.cor !== "qualquer") {
      ok =
        signal === r.cor &&
        (r.semanas_min == null || weeks >= r.semanas_min) &&
        (r.semanas_max == null || weeks <= r.semanas_max);
    }
    if (!ok) continue;
    const mods = [...r.modulos, ...(r.usar_tag_uso ? modulesForTag(input.tagUso, cfg) : [])];
    for (const id of mods) {
      if (done.has(id) || seen.has(id)) continue;
      const m = cfg.modulos.find((x) => x.id === id);
      if (!m) continue;
      seen.add(id);
      out.push({ moduleId: id, moduleName: m.nome, motivo: r.motivo, ruleId: r.id });
    }
  }
  return out;
}

export type Milestones = { primeiro: string | null; segundo: string | null };

/** Data em que cada marco foi atingido (null = ainda não). */
export function computeMilestones(
  participations: Participation[],
  cfg: MasterclassConfig = DEFAULT_MASTERCLASS_CONFIG,
): Milestones {
  const reach = (rule: SuccessRule): string | null => {
    const rel = participations
      .filter((p) => rule.modulos.includes(p.module_id))
      .sort((a, b) => a.held_at.localeCompare(b.held_at));
    // participações distintas por módulo
    const firstByModule = new Map<number, string>();
    for (const p of rel)
      if (!firstByModule.has(p.module_id)) firstByModule.set(p.module_id, p.held_at);
    const dates = [...firstByModule.values()].sort();
    if (dates.length < rule.participacoes) return null;
    const uses = rel
      .filter((p) => p.used_in_project)
      .map((p) => p.used_at || p.held_at)
      .sort();
    if (uses.length < rule.usos) return null;
    const when = [dates[rule.participacoes - 1], rule.usos ? uses[rule.usos - 1] : ""]
      .filter(Boolean)
      .sort();
    return when[when.length - 1] ?? null;
  };
  return { primeiro: reach(cfg.sucesso.primeiro), segundo: reach(cfg.sucesso.segundo) };
}
