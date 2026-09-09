/*
 * Funcionalidades da plataforma — Bloco 12 do playbook: cada funcionalidade
 * tem um momento certo de oferta (tag_uso, tempo de uso, sinaleira, volume
 * de pessoas mapeadas, masterclass relacionada). Catálogo em
 * cs_settings.features; aqui os padrões e a lógica pura.
 */
export type FeatureRule = {
  id: string;
  nome: string;
  /** Para quem (texto do playbook). */
  para_quem: string;
  /** tag_uso aceitas; vazio = qualquer. "ambos" sempre aceita quando a lista não está vazia. */
  tag_uso: string[];
  /** Dias mínimos de licença. */
  dias_min?: number;
  /** Sinaleiras ideais; vazio = qualquer cor. */
  sinaleiras: string[];
  /** Exige verde consolidado (8+ semanas). */
  verde_consolidado?: boolean;
  /** Mínimo de pessoas mapeadas na plataforma. */
  pessoas_min?: number;
  /** Oferecer junto do módulo de masterclass N (realizado ou sugerido). */
  junto_modulo?: number;
  /** Não oferecer no primeiro contato de vermelho (1ª–2ª semana). */
  nao_vermelho_inicial?: boolean;
  resolve: string;
  gancho: string;
};

export type FeaturesConfig = {
  funcionalidades: FeatureRule[];
  /** Depois de oferecida sem resposta, sugerir de novo após N dias. */
  reoferta_dias: number;
  /** Depois de recusada, sugerir de novo após N dias. */
  recusa_dias: number;
};

export const DEFAULT_FEATURES_CONFIG: FeaturesConfig = {
  reoferta_dias: 90,
  recusa_dias: 180,
  funcionalidades: [
    {
      id: "compat_cargos",
      nome: "Compatibilidade de Cargos",
      para_quem: "Clientes com tag_uso = recrutamento ou recrutamento e desenvolvimento",
      tag_uso: ["recrutamento"],
      dias_min: 90,
      sinaleiras: ["verde", "amarelo"],
      nao_vermelho_inicial: true,
      resolve: "Torna o processo seletivo mais objetivo.",
      gancho: "Vocês já têm o perfil de cargo construído para as vagas que mais abrem?",
    },
    {
      id: "compat_competencias",
      nome: "Compatibilidade de Competências",
      para_quem: "Clientes com tag_uso = desenvolvimento ou recrutamento e desenvolvimento",
      tag_uso: ["desenvolvimento"],
      dias_min: 90,
      sinaleiras: ["verde", "amarelo"],
      resolve: "Conecta o desenvolvimento ao que a função realmente exige, não só ao perfil do profissional.",
      gancho: "Quando o cliente fala em PDI ou avaliação de desempenho.",
    },
    {
      id: "tendencias_grupo",
      nome: "Tendências de Grupo",
      para_quem: "Clientes com 5+ pessoas já mapeadas na plataforma",
      tag_uso: [],
      dias_min: 180,
      sinaleiras: ["verde"],
      verde_consolidado: true,
      pessoas_min: 5,
      resolve: "Mostra o comportamento do time como um todo — complementaridade, tensões, riscos de comunicação.",
      gancho: "Quando há volume de dados para leitura coletiva.",
    },
    {
      id: "lider_liderado",
      nome: "Líder × Liderado",
      para_quem: "Clientes com programas de liderança ou com novos gestores",
      tag_uso: [],
      sinaleiras: [],
      junto_modulo: 5,
      resolve: "Embasa o onboarding comportamental de líderes com dados reais, não intuição.",
      gancho: "Junto com o Módulo 5, ou quando o cliente menciona que tem novo líder.",
    },
    {
      id: "feedback_360",
      nome: "Feedback 360",
      para_quem: "Clientes com cultura de feedback estruturado, geralmente acima de 6 meses de uso",
      tag_uso: [],
      dias_min: 180,
      sinaleiras: ["verde", "amarelo"],
      nao_vermelho_inicial: true,
      resolve: "Avaliação de múltiplas fontes com base comportamental, não só de desempenho subjetivo.",
      gancho: "Quando o cliente já usa bem o perfil individual e está pronto para ir mais fundo.",
    },
  ],
};

export type FeatureOffer = { feature_id: string; status: string; offered_at: string };

export type FeatureSuggestion = { featureId: string; nome: string; motivo: string; gancho: string };

export function suggestFeatures(
  input: {
    tagUso: string | null | undefined;
    licenseDays: number | null;
    signal: string;
    weeksInColor: number;
    pessoasMapeadas: number | null;
    /** Módulos de masterclass realizados ou sugeridos agora. */
    modulos: number[];
    now?: Date;
  },
  offers: FeatureOffer[],
  cfg: FeaturesConfig = DEFAULT_FEATURES_CONFIG,
): FeatureSuggestion[] {
  const now = input.now ?? new Date();
  const days = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
  const blocked = new Set<string>();
  for (const o of offers) {
    if (o.status === "adotada") blocked.add(o.feature_id);
    else if (o.status === "recusada" && days(o.offered_at) < cfg.recusa_dias) blocked.add(o.feature_id);
    else if (o.status === "oferecida" && days(o.offered_at) < cfg.reoferta_dias) blocked.add(o.feature_id);
  }
  const out: FeatureSuggestion[] = [];
  for (const f of cfg.funcionalidades) {
    if (blocked.has(f.id)) continue;
    const why: string[] = [];
    if (f.tag_uso.length) {
      const ok = input.tagUso === "ambos" || (input.tagUso != null && f.tag_uso.includes(input.tagUso));
      if (!ok) continue;
      why.push(`uso: ${input.tagUso}`);
    }
    if (f.dias_min != null) {
      if (input.licenseDays == null || input.licenseDays < f.dias_min) continue;
      why.push(`${input.licenseDays} dias de uso`);
    }
    if (f.pessoas_min != null) {
      if (input.pessoasMapeadas == null || input.pessoasMapeadas < f.pessoas_min) continue;
      why.push(`${input.pessoasMapeadas} pessoas mapeadas`);
    }
    if (f.junto_modulo != null) {
      if (!input.modulos.includes(f.junto_modulo)) continue;
      why.push(`junto do Módulo ${f.junto_modulo}`);
    }
    if (f.sinaleiras.length) {
      if (!f.sinaleiras.includes(input.signal)) continue;
      if (f.verde_consolidado && !(input.signal === "verde" && input.weeksInColor >= 8)) continue;
      why.push(f.verde_consolidado ? "verde consolidado" : `sinaleira ${input.signal}`);
    }
    if (f.nao_vermelho_inicial && input.signal === "vermelho" && input.weeksInColor <= 2) continue;
    out.push({ featureId: f.id, nome: f.nome, motivo: why.join(" · ") || f.gancho, gancho: f.gancho });
  }
  return out;
}
