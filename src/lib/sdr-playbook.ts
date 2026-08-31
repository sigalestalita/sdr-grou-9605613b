/**
 * Playbook de Pré-Vendas SDR — Grou HRTech (versão operacional 2026).
 *
 * Fonte: "Playbook de Pré-Vendas SDR — Guia Prático Inbound RH".
 * Somente o que é operável dentro do Grou Compass foi absorvido: jornada,
 * cadências multicanais por porte, scripts, BANT, objeções, motivos de
 * descarte e metas. Integrações externas (RD Station CRM / VoIP) ficaram
 * fora de propósito — aqui a operação acontece no próprio Compass.
 */
import type { TouchAction, TouchChannel } from "./touch-types";

export type SdrTrack = "pme" | "mid" | "enterprise";

export const SDR_TRACKS: SdrTrack[] = ["pme", "mid", "enterprise"];

export const TRACK_LABEL: Record<SdrTrack, string> = {
  pme: "PME (<100 func.)",
  mid: "Mid-Market (100–500 func.)",
  enterprise: "Enterprise (+500 func.)",
};

export const TRACK_SUBTITLE: Record<SdrTrack, string> = {
  pme: "Transacional / curta — 7 a 10 dias, 12 touchpoints",
  mid: "Medium touch — 12 a 15 dias, 13 touchpoints",
  enterprise: "High touch — até 30 dias, foco em ligações diretas",
};

export type CadenceStep = {
  /** Identificador estável usado para marcar o passo como feito. */
  id: string;
  day: number;
  period: "manha" | "tarde";
  channel: TouchChannel;
  actionType: TouchAction;
  /** Rótulo do canal como no playbook (WHATS, TEL (SLA), E-MAIL, LINKEDIN…). */
  channelTag: string;
  title: string;
  script: string;
  breakup?: boolean;
};

const step = (s: CadenceStep) => s;

/** Cadência PME — transacional/curta (7-10 dias, 12 touchpoints). */
const PME_STEPS: CadenceStep[] = [
  step({
    id: "pme-d1-whats", day: 1, period: "manha", channel: "whatsapp",
    actionType: "mensagem_enviada", channelTag: "WHATS (SLA <15m)",
    title: "Entrada Inbound (<15 min)",
    script: "Olá [Nome]! Vi seu pedido de demo do PDA. Consegue falar 2 min agora?",
  }),
  step({
    id: "pme-d1-email", day: 1, period: "manha", channel: "email",
    actionType: "email_enviado", channelTag: "E-MAIL",
    title: "E-mail de abertura",
    script: "Envio do infográfico PDA e da apresentação institucional solicitada no site.",
  }),
  step({
    id: "pme-d1-tel", day: 1, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (SLA)",
    title: "Ligação imediata",
    script: "Oi [Nome], sou [SDR] da Grou. Liguei rápido pois vi sua conversão recente no nosso site…",
  }),
  step({
    id: "pme-d2-tel-manha", day: 2, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação tática manhã",
    script: "Tentativa na abertura comercial para sondagem da estrutura de RH.",
  }),
  step({
    id: "pme-d2-tel-tarde", day: 2, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (TURNO OPOSTO)",
    title: "Ligação turno oposto",
    script: "Olá [Nome], tentando à tarde. Gostaria de entender sua prioridade de R&S…",
  }),
  step({
    id: "pme-d3-audio", day: 3, period: "manha", channel: "whatsapp",
    actionType: "audio_enviado", channelTag: "ÁUDIO",
    title: "Áudio de valor (30s)",
    script: "[Áudio] Gravei rápido pra te mostrar como reduzimos em 50% o tempo no R&S…",
  }),
  step({
    id: "pme-d3-tel", day: 3, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação de conexão",
    script: "Chamada rápida para verificar o recebimento do áudio e validar a dor.",
  }),
  step({
    id: "pme-d4-tel", day: 4, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação diagnóstico",
    script: "Chamada direta focada no custo de contratações erradas em PMEs.",
  }),
  step({
    id: "pme-d5-tel", day: 5, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação follow-up",
    script: "[Nome], conseguimos reservar 15 min amanhã cedo para uma demo objetiva?",
  }),
  step({
    id: "pme-d7-case", day: 7, period: "tarde", channel: "email",
    actionType: "email_enviado", channelTag: "E-MAIL",
    title: "Case PME",
    script: "Veja como esta empresa de 60 funcionários reduziu o turnover no primeiro trimestre.",
  }),
  step({
    id: "pme-d8-tel", day: 8, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação penúltima",
    script: "Chamada direta para tentativa de agendamento antes da pausa de contatos.",
  }),
  step({
    id: "pme-d10-breakup", day: 10, period: "tarde", channel: "whatsapp",
    actionType: "mensagem_enviada", channelTag: "BREAK-UP", breakup: true,
    title: "Break-up transacional",
    script: "[Nome], como não tivemos retorno, estou pausando os contatos. Se precisar, avise!",
  }),
];

/** Cadência Mid-Market — medium touch (12-15 dias, 13 touchpoints). */
const MID_STEPS: CadenceStep[] = [
  step({
    id: "mid-d1-whats", day: 1, period: "manha", channel: "whatsapp",
    actionType: "mensagem_enviada", channelTag: "WHATS (SLA <15m)",
    title: "Trinca boas-vindas",
    script: "Olá [Nome]! Como está a estruturação de DHO e assessments na [Empresa]?",
  }),
  step({
    id: "mid-d1-tel", day: 1, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (SLA)",
    title: "Ligação imediata SLA",
    script: "Primeiro contato telefônico direto para entender a estrutura de RH mid-market.",
  }),
  step({
    id: "mid-d2-linkedin", day: 2, period: "manha", channel: "linkedin",
    actionType: "mensagem_linkedin", channelTag: "LINKEDIN",
    title: "Social selling",
    script: "Conexão para troca de boas práticas de retenção de talentos + case de 35% de redução de turnover.",
  }),
  step({
    id: "mid-d2-tel", day: 2, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação pós-LinkedIn",
    script: "Chamada fazendo gancho com o convite enviado no LinkedIn.",
  }),
  step({
    id: "mid-d3-tel", day: 3, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação diagnóstico",
    script: "Oi [Nome], ligando para mapear se seus líderes realizam gestão baseada em perfil.",
  }),
  step({
    id: "mid-d5-email", day: 5, period: "tarde", channel: "email",
    actionType: "email_enviado", channelTag: "E-MAIL",
    title: "E-mail valor DHO",
    script: "Estudo sobre a relação entre autoconhecimento comportamental e retenção de líderes.",
  }),
  step({
    id: "mid-d6-tel", day: 6, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação pós-e-mail",
    script: "Checagem do estudo enviado por e-mail para o gestor de RH.",
  }),
  step({
    id: "mid-d7-video", day: 7, period: "manha", channel: "whatsapp",
    actionType: "mensagem_enviada", channelTag: "VÍDEO",
    title: "Vídeo demonstrativo",
    script: "Vídeo curto (1 min) mostrando o PDA operando na prática.",
  }),
  step({
    id: "mid-d8-tel", day: 8, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação pós-vídeo",
    script: "Follow-up telefônico para comentar os dados demonstrados no vídeo.",
  }),
  step({
    id: "mid-d9-tel", day: 9, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação acompanhamento",
    script: "Gostaria de agendar 15 min com nosso especialista de mid-market.",
  }),
  step({
    id: "mid-d11-audio", day: 11, period: "manha", channel: "whatsapp",
    actionType: "audio_enviado", channelTag: "ÁUDIO",
    title: "Áudio consultivo",
    script: "[Áudio] Percebo que alinhar o perfil dos líderes é um gargalo comum no mid-market…",
  }),
  step({
    id: "mid-d12-tel", day: 12, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação penúltima",
    script: "Contato telefônico focado nos tomadores de decisão e no BP de RH.",
  }),
  step({
    id: "mid-d15-breakup", day: 15, period: "tarde", channel: "email",
    actionType: "email_enviado", channelTag: "BREAK-UP", breakup: true,
    title: "Break-up formal",
    script: "Encerrando contatos. Entendo o momento atarefado do RH. Seguimos à disposição.",
  }),
];

/** Cadência Enterprise — high touch (dias 1 a 30). */
const ENTERPRISE_STEPS: CadenceStep[] = [
  step({
    id: "ent-d1-linkedin", day: 1, period: "manha", channel: "linkedin",
    actionType: "mensagem_linkedin", channelTag: "LINKEDIN",
    title: "Mapeamento executivo",
    script: "Acompanho a [Empresa]. Na Grou, apoiamos CHROs com inteligência comportamental.",
  }),
  step({
    id: "ent-d1-tel", day: 1, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ASSESSORIA)",
    title: "Contato assessoria",
    script: "Gostaria de falar com a assessoria do [CHRO] para apresentar nosso estudo de perfil.",
  }),
  step({
    id: "ent-d2-email", day: 2, period: "manha", channel: "email",
    actionType: "email_enviado", channelTag: "E-MAIL",
    title: "E-mail diretoria de RH",
    script: "Retention & PDA na [Empresa]. Apresento o modelo de avaliação comportamental Grou…",
  }),
  step({
    id: "ent-d2-tel", day: 2, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (DIRETO)",
    title: "Ligação direta executivo",
    script: "Tentativa telefônica em horário nobre executivo (final de tarde).",
  }),
  step({
    id: "ent-d3-whats", day: 3, period: "tarde", channel: "whatsapp",
    actionType: "mensagem_enviada", channelTag: "WHATS",
    title: "Mensagem consultiva",
    script: "Vi sua conversão no site. Gostaria de entender quais metas de DHO são prioritárias.",
  }),
  step({
    id: "ent-d4-tel", day: 4, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (SECRETARIA/BP)",
    title: "Ligação mapeamento BP",
    script: "Contato com Business Partners para alinhar agenda com o gerente/diretor.",
  }),
  step({
    id: "ent-d5-tel", day: 5, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação diagnóstico",
    script: "[Nome], bom dia! Liguei para debatermos o impacto do turnover em cargos estratégicos.",
  }),
  step({
    id: "ent-d6-tel", day: 6, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação de seguimento",
    script: "Chamada para averiguar disponibilidade da diretoria para uma reunião de 20 min.",
  }),
  step({
    id: "ent-d7-email", day: 7, period: "tarde", channel: "email",
    actionType: "email_enviado", channelTag: "E-MAIL",
    title: "Estudo ROI Enterprise",
    script: "Case ROI (+1000 func.): como o grupo reduziu custos de rescisão em 30%.",
  }),
  step({
    id: "ent-d8-tel", day: 8, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação pós-ROI",
    script: "Ligação para discutir os indicadores financeiros do estudo de ROI enviado.",
  }),
  step({
    id: "ent-d9-inmail", day: 9, period: "manha", channel: "linkedin",
    actionType: "mensagem_linkedin", channelTag: "INMAIL",
    title: "InMail do diretor",
    script: "Nosso diretor sugeriu este artigo sobre o eixo de Autocontrole no PDA.",
  }),
  step({
    id: "ent-d11-tel-audio", day: 11, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL + ÁUDIO",
    title: "Ligação + áudio executivo",
    script: "Chamada direta seguida de áudio reforçando a precisão técnica do PDA.",
  }),
  step({
    id: "ent-d14-tel", day: 14, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Chamada alinhamento",
    script: "Buscando contato em horário alternativo para alinhar agenda com nossos especialistas.",
  }),
  step({
    id: "ent-d15-tel", day: 15, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação de mapeamento",
    script: "Chamada focada na equipe técnica de Desenvolvimento Organizacional.",
  }),
  step({
    id: "ent-d17-email", day: 17, period: "tarde", channel: "email",
    actionType: "email_enviado", channelTag: "E-MAIL",
    title: "Benchmarking RH",
    script: "Sessão de Benchmarking RH: convite para apresentar dados comparativos do setor.",
  }),
  step({
    id: "ent-d18-tel", day: 18, period: "manha", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação benchmarking",
    script: "Contato reforçando o valor do convite de benchmarking setorizado.",
  }),
  step({
    id: "ent-d20-whats", day: 20, period: "manha", channel: "whatsapp",
    actionType: "mensagem_enviada", channelTag: "WHATS",
    title: "WhatsApp com gestor",
    script: "Prefere que eu fale direto com o gerente de DHO/T&D para desonerar sua agenda?",
  }),
  step({
    id: "ent-d21-tel", day: 21, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (DIRECT)",
    title: "Direct touch phone",
    script: "Oi [Nome], ligação rápida para confirmar se a pauta de assessment está no radar.",
  }),
  step({
    id: "ent-d22-tel", day: 22, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação de reforço",
    script: "Segunda tentativa de retorno com base no WhatsApp enviado ao gestor.",
  }),
  step({
    id: "ent-d24-linkedin", day: 24, period: "manha", channel: "linkedin",
    actionType: "mensagem_linkedin", channelTag: "LINKEDIN",
    title: "Sincronização InMail",
    script: "Acompanhei as últimas movimentações do seu time de RH. Seguimos à disposição!",
  }),
  step({
    id: "ent-d25-tel", day: 25, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "TEL (ATIVA)",
    title: "Ligação pré-break-up",
    script: "Última tentativa telefônica direta antes do encerramento formal.",
  }),
  step({
    id: "ent-d27-breakup", day: 27, period: "tarde", channel: "email",
    actionType: "email_enviado", channelTag: "BREAK-UP", breakup: true,
    title: "Break-up relacional",
    script: "Encerrando tentativas Grou. Considerando a agenda atarefada, vou interromper os contatos.",
  }),
  step({
    id: "ent-d30-final", day: 30, period: "tarde", channel: "ligacao",
    actionType: "ligacao_realizada", channelTag: "PORTAS ABERTAS / TEL", breakup: true,
    title: "Recado final & despedida cordial",
    script:
      "Deixo meu contato definitivo e faço uma rápida chamada de cortesia. Se a diretoria reavaliar a gestão comportamental em 2026, será um prazer conversar!",
  }),
];

export const TRACK_STEPS: Record<SdrTrack, CadenceStep[]> = {
  pme: PME_STEPS,
  mid: MID_STEPS,
  enterprise: ENTERPRISE_STEPS,
};

export const ALL_STEPS_BY_ID: Record<string, CadenceStep> = Object.fromEntries(
  SDR_TRACKS.flatMap((t) => TRACK_STEPS[t].map((s) => [s.id, s])),
);

/** SLA de primeiro atendimento, em minutos. */
export const SLA_FIRST_TOUCH_MINUTES = 15;

export const SDR_TARGETS = {
  meetingsPerMonthGlobal: 80,
  meetingsPerMonthPerSdr: 40,
  meetingsPerDayPerSdr: 2,
  minAttemptsBeforeDiscard: 6,
  showRate: 0.85,
  inviteAcceptRate: 0.95,
};

export const FUNNEL_GUIDE: { stage: string; objective: string; trigger: string }[] = [
  {
    stage: "01. Entrada Inbound",
    objective: "Validar dados básicos e fit de perfil (empresa, cargo de RH, nº de funcionários).",
    trigger: "Iniciar primeiro contato via WhatsApp ou ligação em até 15 min.",
  },
  {
    stage: "02. Em qualificação",
    objective: "Executar a cadência diária multicanal e aplicar o filtro BANT na conversa.",
    trigger: "Diagnóstico completo com a dor real de gestão de pessoas identificada.",
  },
  {
    stage: "03. Em contato",
    objective: "Interação bidirecional estabelecida via mensagem, e-mail respondido ou chamada.",
    trigger: "Lead responde e demonstra abertura ativa para conversar sobre RH.",
  },
  {
    stage: "04. Agendamento",
    objective: "Definir data/hora com o lead, agendar com o especialista e registrar o BANT.",
    trigger: "Convite aceito e oportunidade atribuída ao especialista comercial.",
  },
  {
    stage: "05. Reunião realizada",
    objective: "Validar presença do lead junto ao comercial e recolher feedback pós-agenda.",
    trigger: "Mover para oportunidade comercial (se quente) ou descartar com motivo.",
  },
];

export const BANT_GUIDE: {
  key: "budget" | "authority" | "need" | "timeline";
  label: string;
  focus: string;
  questions: string[];
}[] = [
  {
    key: "budget",
    label: "Budget — recursos",
    focus: "Existe verba para DHO, tecnologia de RH ou licença do PDA?",
    questions: [
      "Para iniciativas de DHO ou tech de RH este ano, vocês possuem verba alocada?",
      "Vocês já investem em ferramentas de assessment ou testes comportamentais?",
      "Quanto custa para a empresa uma contratação errada ou a perda de um talento crítico?",
    ],
  },
  {
    key: "authority",
    label: "Authority — decisão",
    focus: "Quem decide e quem influencia a compra de tecnologia de RH?",
    questions: [
      "Além de você, quem mais no RH ou na diretoria participa da validação de tecnologias?",
      "Como costuma funcionar o processo de contratação de novos parceiros de DHO?",
      "Qual é o papel do Business Partner ou da liderança na escolha das ferramentas?",
    ],
  },
  {
    key: "need",
    label: "Need — dor real",
    focus: "Turnover, contratações desalinhadas, falta de dados comportamentais, liderança despreparada.",
    questions: [
      "Como lidam hoje com turnover precoce ou contratações desalinhadas à cultura?",
      "Suas lideranças estão preparadas para fazer gestão baseada em perfil?",
      "Qual o maior desafio: velocidade no R&S, retenção ou desenvolvimento de líderes?",
    ],
  },
  {
    key: "timeline",
    label: "Timeline — urgência",
    focus: "Prazo previsto para contratar e implementar a solução.",
    questions: [
      "Caso nossa solução atenda às demandas, para quando seria ideal iniciar?",
      "Existe algum marco próximo (ex.: plano de contratações) que exige essa solução?",
      "Quais metas prioritárias de RH precisam ser entregues nos próximos 3 a 6 meses?",
    ],
  },
];

export const BANT_STATUS = ["nao_avaliado", "ok", "parcial", "bloqueio"] as const;
export type BantStatus = (typeof BANT_STATUS)[number];
export const BANT_STATUS_LABEL: Record<BantStatus, string> = {
  nao_avaliado: "Não avaliado",
  ok: "Validado",
  parcial: "Parcial",
  bloqueio: "Bloqueio",
};

export type LeadBant = {
  budget?: { status?: BantStatus; notes?: string };
  authority?: { status?: BantStatus; notes?: string };
  need?: { status?: BantStatus; notes?: string };
  timeline?: { status?: BantStatus; notes?: string };
  summary?: string;
  updatedAt?: string;
};

/** Motivos de descarte padronizados do playbook. */
export const DISCARD_REASONS: { reason: string; criteria: string; action: string }[] = [
  {
    reason: "Fora do ICP / sem perfil",
    criteria: "Estudante, profissional sem empresa, empresa sem funcionários gerenciáveis ou setor incompatível.",
    action: "Marcar como perdido, remover da cadência e manter em nutrição passiva.",
  },
  {
    reason: "Sem orçamento / verba",
    criteria: "Empresa confirma a dor no RH, porém não possui recurso orçamentário no ano.",
    action: "Registrar o motivo e agendar tarefa de recontato para o próximo semestre.",
  },
  {
    reason: "Sem prazo / engavetado",
    criteria: "RH tem interesse, mas a diretoria congelou contratações ou não há previsão (> 6 meses).",
    action: "Mover para nutrição com materiais de benchmarking.",
  },
  {
    reason: "Incontactável / sem resposta",
    criteria: "Cadência multicanal esgotada (inclusive ligações) sem retorno do prospect.",
    action: "Perdido por inatividade e reengajamento em campanhas futuras.",
  },
  {
    reason: "Já utiliza concorrente",
    criteria: "Empresa renovou com concorrente direto ou declarou satisfação plena.",
    action: "Mapear a ferramenta concorrente e a data de renovação.",
  },
];

export const OBJECTIONS: { objection: string; response: string }[] = [
  {
    objection: "Só queria saber o preço",
    response:
      "Nossa plataforma tem planos personalizados conforme o número de funcionários e as ferramentas usadas no seu RH. Em 15 minutos entendo seu cenário e te apresento o investimento exato, sem compromisso.",
  },
  {
    objection: "Não tenho tempo agora",
    response:
      "Entendo total — a agenda do RH é intensa. Posso te mandar um áudio de 1 minuto com o essencial e depois marcamos 15 min no horário que for melhor pra você.",
  },
  {
    objection: "Já uso outro assessment",
    response:
      "Excelente que vocês já investem em perfil comportamental! O PDA da Grou é único por avaliar o eixo de Autocontrole e entregar dados preditivos. Vale uma breve comparação de resultados.",
  },
  {
    objection: "Não sou o decisor",
    response:
      "Sem problema. Me ajuda a mapear quem mais participa dessa decisão? Posso te apoiar a montar o racional interno com dados e um material objetivo.",
  },
];

export const APPROACH_TEMPLATES: { title: string; body: string }[] = [
  {
    title: "Boas-vindas inbound (SLA <15 min)",
    body:
      "Olá [Nome], vi que você solicitou acesso ao [Material/Demo] no site da Grou. Como vocês estruturam hoje a avaliação comportamental no RH?",
  },
  {
    title: "Social selling & conexão",
    body:
      "Olá [Nome], passei para te conectar aqui no LinkedIn e compartilhar um case de como reduzimos em 35% o turnover no RH usando o PDA.",
  },
  {
    title: "Áudio curto consultivo",
    body:
      "Oi [Nome], tudo bem? Gravei este áudio rápido porque sei que gestores de RH estão focados em retenção agora. Consegue me ouvir 2 minutos?",
  },
];

export const SALES_MATERIALS: { title: string; description: string }[] = [
  { title: "Apresentação institucional & infográfico PDA", description: "Benefícios de R&S e retenção para gestão de pessoas." },
  { title: "E-book PDI & eixos comportamentais", description: "Guia prático para PDI e análise de perfis para DHO." },
  { title: "Case de sucesso & ROI (PME/Enterprise)", description: "Redução de 35% de turnover e retorno sobre investimento em R&S." },
  { title: "Vídeo demonstrativo PDA (1-2 min)", description: "Software na prática: mapas de perfil e relatórios preditivos." },
];

export const ANTI_NO_SHOW: string[] = [
  "Enviar o convite de agenda imediatamente após a ligação de confirmação.",
  "Corpo do convite completo: contexto do lead, dores mapeadas e resumo BANT.",
  "Confirmar presença 24h antes e novamente no dia da reunião.",
  "Registrar o BANT completo antes da passagem de bastão ao especialista.",
  "Acompanhar o comparecimento e recolher feedback pós-reunião com o comercial.",
];
