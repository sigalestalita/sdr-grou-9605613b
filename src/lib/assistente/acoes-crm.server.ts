import type { CtxNucleo } from "@/lib/nucleo";
import { CS_AGENDA_TYPES, CS_CONTACT_TYPES, CS_STAGES, CS_TASK_TYPES } from "@/lib/cs-types";
import { CS_FOLLOWUP_CHANNELS, CS_FOLLOWUP_OUTCOMES } from "@/lib/cs-follow-up-types";

/*
 * Ações de tarefas, CS e negócios pela assistente. Cada uma chama o mesmo
 * núcleo da tela (mesma validação, mesmas regras, mesmo acesso de quem pede);
 * a assistente só monta os dados. Nada roda sem confirmado: true.
 * Fora de propósito: apagar tarefa (a assistente só reabre ou cancela).
 */

type Zod = { parse: (d: unknown) => unknown };
type Acao = {
  descricao: string;
  campos: string;
  carregar: () => Promise<{ schema: Zod; nucleo: (c: CtxNucleo, d: never) => Promise<unknown> }>;
  link?: (d: Record<string, unknown>) => string | null;
};

const lista = (xs: readonly string[]) => xs.join(" | ");
const ficha = (d: Record<string, unknown>) =>
  d.clientUid ? `/empresas/${String(d.clientUid)}` : null;
const negocio = (d: Record<string, unknown>) =>
  d.dealId ? `/negocio/${String(d.dealId)}` : d.id ? `/negocio/${String(d.id)}` : null;

export const ACOES_CRM: Record<string, Acao> = {
  // ------------------------------------------------------ tarefas do CS
  criar_tarefa_cs: {
    descricao:
      "Cria (ou edita, com id) uma tarefa do CS para um cliente. O prazo cai no próximo dia disponível da agenda de tarefas (feriado, folga, férias).",
    campos: `clientUid, title, taskType (${lista(CS_TASK_TYPES)}), dueAt (ISO), ownerId? (padrão: quem pede), contactId? (cs_contacts), notes?, id? (para editar)`,
    carregar: async () => {
      const m = await import("@/lib/cs-tasks.functions");
      return { schema: m.saveCsTaskSchema, nucleo: m.saveCsTaskNucleo as never };
    },
    link: ficha,
  },
  concluir_tarefa_cs: {
    descricao:
      "Conclui uma tarefa do CS (registra na linha do tempo). Tarefa de e-mail/WhatsApp exige evidência; só a gestão conclui sem ela, com justificativa (asManager + notes).",
    campos: "id, notes?, asManager?",
    carregar: async () => {
      const m = await import("@/lib/cs-tasks.functions");
      return { schema: m.completeCsTaskSchema, nucleo: m.completeCsTaskNucleo as never };
    },
  },
  status_tarefa_cs: {
    descricao: "Reabre ou cancela uma tarefa do CS (apagar não é permitido pela assistente).",
    campos: "id, action (reabrir | cancelar)",
    carregar: async () => {
      const m = await import("@/lib/cs-tasks.functions");
      return { schema: m.setCsTaskStatusSchema, nucleo: m.setCsTaskStatusNucleo as never };
    },
  },
  concluir_follow_up_cs: {
    descricao:
      "Registra o resultado de um follow-up do CS (da lista de Tarefas/Follow-ups) e, opcionalmente, agenda o próximo.",
    campos: `kind (reuniao | alerta | jornada | sem_contato | timeline | tarefa), refId?, clientUid, title, outcome? (${lista(CS_FOLLOWUP_OUTCOMES)}), channel? (${lista(CS_FOLLOWUP_CHANNELS)}), notes?, nextAt? (ISO), asManager?`,
    carregar: async () => {
      const m = await import("@/lib/cs-follow-ups.functions");
      return { schema: m.completeCsFollowUpSchema, nucleo: m.completeCsFollowUpNucleo as never };
    },
    link: ficha,
  },
  remarcar_follow_up_cs: {
    descricao: "Remarca um follow-up do CS para outra data.",
    campos:
      "kind (reuniao | alerta | jornada | sem_contato | timeline | tarefa), refId?, clientUid, title, nextAt (ISO), notes?",
    carregar: async () => {
      const m = await import("@/lib/cs-follow-ups.functions");
      return {
        schema: m.rescheduleCsFollowUpSchema,
        nucleo: m.rescheduleCsFollowUpNucleo as never,
      };
    },
    link: ficha,
  },
  // ------------------------------------------------------ cliente do CS
  registrar_contato_cs: {
    descricao:
      "Registra um contato/atividade na linha do tempo do cliente (conta como contato para a sinaleira, salvo countsAsContact: false).",
    campos:
      "clientUid, channel (ligacao | whatsapp | email | reuniao | presencial | observacao), title, description?, occurredAt? (ISO), countsAsContact? (padrão true)",
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.addCsTimelineEntrySchema, nucleo: m.addCsTimelineEntryNucleo as never };
    },
    link: ficha,
  },
  agendar_reuniao_cs: {
    descricao:
      "Agenda (status agendada) ou registra (realizada) uma reunião do CS com o cliente. categoryId vem de cs_meeting_categories (consultar_base).",
    campos:
      "clientUid, title, categoryId, occurredAt (ISO), durationMinutes?, status? (realizada | agendada | cancelada | no_show; padrão realizada), contactId? (cs_contacts), attendees?, meetingUrl?, summary?, nextStep?, nextStepAt?, id? (para editar)",
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.saveCsMeetingSchema, nucleo: m.saveCsMeetingNucleo as never };
    },
    link: ficha,
  },
  mudar_etapa_cs: {
    descricao: "Muda a etapa da jornada do cliente no CS.",
    campos: `clientUid, stage (${lista(CS_STAGES)})`,
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.moveCsStageSchema, nucleo: m.moveCsStageNucleo as never };
    },
    link: ficha,
  },
  trocar_responsavel_cs: {
    descricao: "Troca o responsável de CS ou o comercial de um cliente.",
    campos:
      "clientUid, field (cs_responsavel_id | comercial_responsavel_id), userId (ou null para tirar)",
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.setCsOwnerSchema, nucleo: m.setCsOwnerNucleo as never };
    },
    link: ficha,
  },
  adicionar_tag_cs: {
    descricao: "Adiciona uma tag ao cliente do CS.",
    campos: "clientUid, tag",
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.addCsTagSchema, nucleo: m.addCsTagNucleo as never };
    },
    link: ficha,
  },
  remover_tag_cs: {
    descricao: "Remove uma tag do cliente (id da linha em cs_client_tags).",
    campos: "id",
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.removeCsTagSchema, nucleo: m.removeCsTagNucleo as never };
    },
  },
  resolver_alerta_cs: {
    descricao: "Resolve um alerta do CS registrando como foi o contato.",
    campos: `alertId, contact_type (${lista(CS_CONTACT_TYPES)}), whatsapp_answered?, agenda_type? (${lista(CS_AGENDA_TYPES)}), observation?, cliente_autossuficiente?`,
    carregar: async () => {
      const m = await import("@/lib/cs.functions");
      return { schema: m.resolveCsAlertSchema, nucleo: m.resolveCsAlertNucleo as never };
    },
  },
  // ------------------------------------------------------ negócios
  registrar_atividade_negocio: {
    descricao:
      "Registra atividade no negócio (ligação, e-mail, reunião, WhatsApp, proposta, nota) e, opcionalmente, o próximo passo; mencionados recebem aviso.",
    campos:
      "dealId, tipo (ligacao | email | reuniao | whatsapp | proposta | nota), descricao?, occurredAt? (ISO), proximoPasso?, proximoPassoEm? (ISO), mencionados? (ids de pessoas)",
    carregar: async () => {
      const m = await import("@/lib/comercial-negocio.functions");
      return { schema: m.registrarAtividadeSchema, nucleo: m.registrarAtividadeNucleo as never };
    },
    link: negocio,
  },
  mover_etapa_negocio: {
    descricao:
      "Move o negócio para outra etapa aberta do funil (stageId de pipeline_stages). Para ganhar/perder use fechar_negocio.",
    campos: "dealId, stageId",
    carregar: async () => {
      const m = await import("@/lib/comercial-negocio.functions");
      return { schema: m.moverEtapaSchema, nucleo: m.moverEtapaNucleo as never };
    },
    link: negocio,
  },
  editar_negocio: {
    descricao:
      "Edita campos do negócio: nome, valor, temperatura, tipo de venda, produtos, próximo passo e data, reunião marcada.",
    campos:
      "id, nome?, amount?, temperatura? (quente | morno | frio), tipo_venda?, produtos_texto?, proximo_passo?, proximo_passo_em? (ISO), reuniao_em? (ISO)",
    carregar: async () => {
      const m = await import("@/lib/comercial-negocio.functions");
      return { schema: m.salvarNegocioSchema, nucleo: m.salvarNegocioNucleo as never };
    },
    link: negocio,
  },
  congelar_negocio: {
    descricao: "Congela o negócio até uma data (sai do funil até lá) ou descongela (ate: null).",
    campos: "dealId, ate (AAAA-MM-DD ou null), motivo?",
    carregar: async () => {
      const m = await import("@/lib/comercial-negocio.functions");
      return { schema: m.congelarNegocioSchema, nucleo: m.congelarNegocioNucleo as never };
    },
    link: negocio,
  },
  fechar_negocio: {
    descricao:
      "Fecha o negócio. Perdido: motivo. Ganho: vai para o faturamento — exige a data da ordem de compra e a situação da OC; as mesmas pendências da tela valem.",
    campos:
      "resultado (ganho | perdido), dealId; se perdido: motivo; se ganho: ordemCompraEm (ISO), ocSituacao (numero | nao_tem | anexo), ordemCompraNumero?, contratoAssinadoEm?, amount?, observacaoAdm?, cnpjFaturamento?, emissaoPrevistaEm? (AAAA-MM-DD), prazoPagamento?, formaPagamento?, parcelas?, contatoFaturamentoId?",
    carregar: async () => {
      const m = await import("@/lib/comercial-negocio.functions");
      return { schema: m.fecharNegocioSchema, nucleo: m.fecharNegocioNucleo as never };
    },
    link: negocio,
  },
};

export const FERRAMENTA_ACOES_CRM = {
  type: "function",
  function: {
    name: "executar_acao_crm",
    description: `Faz uma ação de tarefas, CS ou negócios pela pessoa, com as mesmas regras e o mesmo acesso da tela. Ache os ids antes (buscar_registros, consultar_base em cs_clients/cs_tasks/cs_alerts/cs_meeting_categories/deals/pipeline_stages/profiles). EXIGE confirmado: true, depois do resumo e do sim da pessoa. Ações (campos em 'dados'):
${Object.entries(ACOES_CRM)
  .map(([nome, a]) => `- ${nome}: ${a.descricao} Campos: ${a.campos}`)
  .join("\n")}`,
    parameters: {
      type: "object",
      properties: {
        acao: { type: "string", enum: Object.keys(ACOES_CRM) },
        dados: { type: "object" },
        confirmado: {
          type: "boolean",
          description: "true só depois que a pessoa confirmou no chat. Sem isso nada é feito.",
        },
      },
      required: ["acao", "dados"],
    },
  },
};

export async function executarAcaoCrm(ctx: CtxNucleo, args: Record<string, unknown>) {
  const nome = String(args.acao ?? "");
  const acao = ACOES_CRM[nome];
  if (!acao) throw new Error(`Ação desconhecida: ${nome}`);
  if (args.confirmado !== true)
    return {
      precisa_confirmar: true,
      instrucao:
        "Não foi executado. Resuma para a pessoa o que será feito e pergunte se pode seguir. Só chame de novo com confirmado: true depois do sim.",
    };
  const dados = (args.dados ?? {}) as Record<string, unknown>;
  if (nome === "status_tarefa_cs" && dados.action === "apagar")
    throw new Error("A assistente não apaga tarefas; cancele ou apague pela tela.");
  const { schema, nucleo } = await acao.carregar();
  let validos: unknown;
  try {
    validos = schema.parse(dados);
  } catch (e) {
    // Devolve o que faltou/errou para a assistente corrigir ou perguntar.
    const issues = (e as { issues?: Array<{ path: unknown[]; message: string }> }).issues;
    throw new Error(
      issues?.length
        ? `Dados inválidos: ${issues.map((i) => `${i.path.join(".") || "dados"}: ${i.message}`).join("; ")}`
        : e instanceof Error
          ? e.message
          : String(e),
    );
  }
  const resultado = await nucleo(ctx, validos as never);
  return { ok: true, acao: nome, resultado, link: acao.link?.(dados) ?? null };
}
