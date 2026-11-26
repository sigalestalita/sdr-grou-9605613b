import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CtxNucleo } from "@/lib/nucleo";
import { filtroDoResponsavel } from "@/lib/comercial/responsavel";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { conferirGanho, resolverPolitica, soDigitos } from "@/lib/faturamento/politica";
import { carregarPolitica, type Db } from "@/lib/faturamento/politica.server";
import { notificar } from "@/lib/notificacoes.server";

/*
 * O que o executivo comercial roda no dia a dia.
 *
 * O módulo nasceu só com leitura — funil, metas, análise. Aqui está a parte de
 * execução: abrir o negócio, registrar o que foi feito, combinar o próximo
 * passo, mover de etapa e fechar. Cada atividade registrada também é o que
 * alimenta o histórico de follow-up que a gestão pediu.
 */

export const TIPOS_ATIVIDADE = [
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "reuniao", rotulo: "Reunião" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "proposta", rotulo: "Proposta" },
  { valor: "nota", rotulo: "Anotação" },
] as const;

const DEAL_COLS =
  "id, nome, company_id, contact_id, executivo_user_id, sdr_user_id, pipeline_id, stage_id, status, amount, temperatura, fonte, campanha, tipo_venda, categoria_venda, produtos_texto, observacao_adm, proximo_passo, proximo_passo_em, reuniao_em, agendado_em, devolutiva_em, proposta_aceita_em, ordem_compra_em, ordem_compra_numero, contrato_assinado_em, adm_checked_at, faturado_em, cs_entregue_em, closed_at, lost_reason, esteira, created_at, updated_at, congelado_ate, congelado_motivo, vezes_congelado";

/** Ficha do negócio: dados, etapas possíveis e histórico. */
export const getNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: negocio, error } = await supabase
      .from("deals")
      .select(
        `${DEAL_COLS}, companies:company_id(id, nome, segmento, num_funcionarios, cidade, estado)`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!negocio) throw new Error("Negócio não encontrado");

    const [{ data: etapas }, { data: atividades }, { data: profiles }] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, pipeline_id, nome, slug, ordem, probabilidade, kind")
        .eq("pipeline_id", negocio.pipeline_id ?? "")
        .order("ordem"),
      supabase
        .from("deal_activities")
        .select("id, tipo, descricao, occurred_at, author_id, de_stage_id, para_stage_id")
        .eq("deal_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(120),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );
    const nomeEtapa = new Map(
      ((etapas ?? []) as Array<{ id: string; nome: string }>).map((e) => [e.id, e.nome]),
    );

    return {
      negocio,
      etapas: etapas ?? [],
      executivoNome: nomeDe.get(negocio.executivo_user_id as string) ?? null,
      sdrNome: nomeDe.get(negocio.sdr_user_id as string) ?? null,
      atividades: (atividades ?? []).map((a) => ({
        id: a.id as string,
        tipo: a.tipo as string,
        descricao: (a.descricao as string | null) ?? null,
        occurredAt: a.occurred_at as string,
        autor: nomeDe.get(a.author_id as string) ?? null,
        deEtapa: nomeEtapa.get(a.de_stage_id as string) ?? null,
        paraEtapa: nomeEtapa.get(a.para_stage_id as string) ?? null,
      })),
    };
  });

/**
 * Registra o que foi feito e, no mesmo gesto, combina o próximo passo. Juntar
 * as duas coisas é o que evita negócio parado sem ninguém perceber.
 */
export const registrarAtividadeSchema = z.object({
  dealId: z.string().uuid(),
  tipo: z.enum(["ligacao", "email", "reuniao", "whatsapp", "proposta", "nota"]),
  descricao: z.string().max(2000).optional(),
  occurredAt: z.string().datetime().optional(),
  proximoPasso: z.string().max(300).nullable().optional(),
  proximoPassoEm: z.string().datetime().nullable().optional(),
  // Pessoas marcadas no registro: recebem notificação com o link do negócio.
  mencionados: z.array(z.string().uuid()).max(10).optional(),
});

/** Núcleo de registrarAtividade: a mesma regra para a tela e para a assistente. */
export async function registrarAtividadeNucleo(
  context: CtxNucleo,
  data: z.infer<typeof registrarAtividadeSchema>,
) {
  const { supabase, userId } = context;

  const { error } = await supabase.from("deal_activities").insert({
    deal_id: data.dealId,
    tipo: data.tipo,
    descricao: data.descricao?.trim() || null,
    occurred_at: data.occurredAt ?? new Date().toISOString(),
    author_id: userId,
  } as never);
  if (error) throw new Error(error.message);

  // Próximo passo só é tocado quando veio no formulário.
  if (data.proximoPasso !== undefined || data.proximoPassoEm !== undefined) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.proximoPasso !== undefined) patch.proximo_passo = data.proximoPasso || null;
    if (data.proximoPassoEm !== undefined) patch.proximo_passo_em = data.proximoPassoEm || null;
    const { error: upErr } = await supabase
      .from("deals")
      .update(patch as never)
      .eq("id", data.dealId);
    if (upErr) throw new Error(upErr.message);
  }

  if (data.mencionados?.length) {
    const [{ data: deal }, { data: autor }] = await Promise.all([
      supabase.from("deals").select("nome").eq("id", data.dealId).maybeSingle(),
      supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    ]);
    await notificar(supabase as unknown as Db, userId, {
      para: data.mencionados,
      tipo: "mencao",
      titulo: `${autor?.full_name || autor?.email || "Alguém"} mencionou você em ${deal?.nome ?? "um negócio"}`,
      corpo: data.descricao ?? null,
      link: `/negocio/${data.dealId}`,
      dealId: data.dealId,
    });
  }

  // Reunião registrada alimenta a métrica de agendas da meta.
  if (data.tipo === "reuniao") {
    await supabase
      .from("deals")
      .update({ reuniao_em: data.occurredAt ?? new Date().toISOString() } as never)
      .eq("id", data.dealId)
      .is("reuniao_em", null);
  }

  return { ok: true };
}

export const registrarAtividade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => registrarAtividadeSchema.parse(d))
  .handler(async ({ data, context }) => registrarAtividadeNucleo(context, data));

export const moverEtapaSchema = z.object({ dealId: z.string().uuid(), stageId: z.string().uuid() });

/** Núcleo de moverEtapa: a mesma regra para a tela e para a assistente. */
export async function moverEtapaNucleo(context: CtxNucleo, data: z.infer<typeof moverEtapaSchema>) {
  const { supabase } = context;
  // A mudança vira atividade sozinha, por trigger no banco.
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: data.stageId, updated_at: new Date().toISOString() } as never)
    .eq("id", data.dealId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export const moverEtapa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => moverEtapaSchema.parse(d))
  .handler(async ({ data, context }) => moverEtapaNucleo(context, data));

/** Edita os campos que o executivo mexe com frequência. */
export const salvarNegocioSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1).max(200).optional(),
  amount: z.number().min(0).max(100_000_000).optional(),
  temperatura: z.enum(["quente", "morno", "frio"]).nullable().optional(),
  tipo_venda: z.string().max(120).nullable().optional(),
  produtos_texto: z.string().max(1000).nullable().optional(),
  proximo_passo: z.string().max(300).nullable().optional(),
  proximo_passo_em: z.string().datetime().nullable().optional(),
  // Reunião que o próprio executivo marcou (vai para o Início e a agenda).
  reuniao_em: z.string().datetime().nullable().optional(),
});

/** Núcleo de salvarNegocio: a mesma regra para a tela e para a assistente. */
export async function salvarNegocioNucleo(
  context: CtxNucleo,
  data: z.infer<typeof salvarNegocioSchema>,
) {
  const { supabase } = context;
  const { id, ...campos } = data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) patch[k] = v;
  const { error } = await supabase
    .from("deals")
    .update(patch as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export const salvarNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => salvarNegocioSchema.parse(d))
  .handler(async ({ data, context }) => salvarNegocioNucleo(context, data));

/**
 * Fecha o negócio. Ganho exige a data da ordem de compra, que é a regra da
 * gestão: aceite de proposta não é venda, e é daí que vinha a diferença entre
 * o número dela e o do financeiro.
 *
 * O ganho também leva o que o ADM precisa para faturar (os campos que hoje
 * vão por e-mail) e é conferido contra a política do cliente: se o cliente
 * exige OC e ela não veio, ou se só paga à vista e veio parcelado, o ganho não
 * passa — é a nota que voltaria 60 dias depois.
 */
export const fecharNegocioSchema = z.discriminatedUnion("resultado", [
  z.object({
    resultado: z.literal("ganho"),
    dealId: z.string().uuid(),
    ordemCompraEm: z.string().datetime(),
    // "numero" (padrão), "nao_tem" (cliente não emite OC) ou "anexo".
    ocSituacao: z.enum(["numero", "nao_tem", "anexo"]).default("numero"),
    ordemCompraNumero: z.string().trim().max(60).optional(),
    ocAnexoUrl: z.string().trim().url().max(500).optional(),
    contratoAssinadoEm: z.string().datetime().nullable().optional(),
    amount: z.number().min(0).max(100_000_000).optional(),
    observacaoAdm: z.string().max(4000).optional(),
    cnpjFaturamento: z.string().max(20).optional(),
    emissaoPrevistaEm: z.string().date().optional(),
    prazoPagamento: z.string().trim().max(120).optional(),
    formaPagamento: z.string().trim().max(60).optional(),
    parcelas: z.number().int().min(1).max(24).optional(),
    contatoFaturamentoId: z.string().uuid().optional(),
  }),
  z.object({
    resultado: z.literal("perdido"),
    dealId: z.string().uuid(),
    motivo: z.string().min(2).max(300),
  }),
]);

/** Núcleo de fecharNegocio: a mesma regra para a tela e para a assistente. */
export async function fecharNegocioNucleo(
  context: CtxNucleo,
  data: z.infer<typeof fecharNegocioSchema>,
) {
  const { supabase, userId } = context;
  const agora = new Date().toISOString();

  const { data: etapas } = await supabase
    .from("pipeline_stages")
    .select("id, kind, pipeline_id")
    .eq("kind", data.resultado === "ganho" ? "won" : "lost");
  const { data: negocio } = await supabase
    .from("deals")
    .select("pipeline_id, company_id, amount, tipo_venda")
    .eq("id", data.dealId)
    .maybeSingle();

  if (data.resultado === "ganho") {
    const companyId = (negocio as { company_id?: string | null } | null)?.company_id ?? null;
    const pol = companyId ? await carregarPolitica(supabase as unknown as Db, companyId) : null;
    const bloqueios = conferirGanho(
      {
        ocSituacao: data.ocSituacao,
        ocNumero: data.ordemCompraNumero ?? null,
        ocAnexoUrl: data.ocAnexoUrl ?? null,
        cnpjFaturamento: data.cnpjFaturamento || pol?.empresa?.cnpj || null,
        emissaoPrevistaEm: data.emissaoPrevistaEm ?? null,
        parcelas: data.parcelas ?? null,
        valor: data.amount ?? Number((negocio as { amount?: number } | null)?.amount ?? 0),
        contatoFaturamento: true,
        clienteNovo: false,
      },
      pol?.efetiva ?? resolverPolitica(null),
    ).filter((p) => p.bloqueia);
    if (bloqueios.length > 0) throw new Error(bloqueios.map((p) => p.mensagem).join(" · "));
  }
  const etapaFinal =
    ((etapas ?? []) as Array<{ id: string; pipeline_id: string }>).find(
      (e) => e.pipeline_id === negocio?.pipeline_id,
    )?.id ?? null;

  const patch: Record<string, unknown> =
    data.resultado === "ganho"
      ? {
          status: "won",
          ordem_compra_em: data.ordemCompraEm,
          oc_situacao: data.ocSituacao,
          ordem_compra_numero: data.ocSituacao === "numero" ? data.ordemCompraNumero || null : null,
          oc_anexo_url: data.ocSituacao === "anexo" ? data.ocAnexoUrl || null : null,
          cnpj_faturamento: soDigitos(data.cnpjFaturamento) || null,
          emissao_prevista_em: data.emissaoPrevistaEm ?? null,
          prazo_pagamento: data.prazoPagamento || null,
          forma_pagamento: data.formaPagamento || null,
          parcelas: data.parcelas ?? null,
          contato_faturamento_id: data.contatoFaturamentoId ?? null,
          contrato_assinado_em: data.contratoAssinadoEm ?? null,
          closed_at: data.ordemCompraEm,
          ...(data.amount !== undefined ? { amount: data.amount } : {}),
          ...(data.observacaoAdm ? { observacao_adm: data.observacaoAdm } : {}),
          proximo_passo: null,
          proximo_passo_em: null,
        }
      : {
          status: "lost",
          lost_reason: data.motivo,
          closed_at: agora,
          proximo_passo: null,
          proximo_passo_em: null,
        };
  if (etapaFinal) patch.stage_id = etapaFinal;
  patch.updated_at = agora;

  const { error } = await supabase
    .from("deals")
    .update(patch as never)
    .eq("id", data.dealId);
  if (error) throw new Error(error.message);

  await supabase.from("deal_activities").insert({
    deal_id: data.dealId,
    tipo: "nota",
    descricao:
      data.resultado === "ganho"
        ? `Venda ganha — ${
            data.ocSituacao === "nao_tem"
              ? "cliente não emite ordem de compra"
              : data.ocSituacao === "anexo"
                ? "ordem de compra anexada"
                : `ordem de compra ${data.ordemCompraNumero}`
          }. Segue para o ADM.`
        : `Negócio perdido — ${data.motivo}`,
    author_id: userId,
  } as never);

  return { ok: true };
}

export const fecharNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => fecharNegocioSchema.parse(d))
  .handler(async ({ data, context }) => fecharNegocioNucleo(context, data));

/**
 * A fila do executivo: o que ele combinou de fazer e ainda não fez, atrasado
 * primeiro. É a tela que substitui a planilha pessoal.
 */
export const minhaFilaComercial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        executivoId: z.string().uuid().optional(),
        dias: z.number().int().min(1).max(60).default(7),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    const alvo = isManager && data.executivoId ? data.executivoId : userId;

    const limite = new Date();
    limite.setHours(23, 59, 59, 999);
    limite.setDate(limite.getDate() + data.dias);

    const [{ data: comPasso }, { data: semPasso }] = await Promise.all([
      supabase
        .from("deals")
        .select(
          `id, nome, amount, proximo_passo, proximo_passo_em, stage_id, companies:company_id(nome)`,
        )
        .or(filtroDoResponsavel(alvo))
        .eq("status", "open")
        .not("proximo_passo_em", "is", null)
        .lte("proximo_passo_em", limite.toISOString())
        .order("proximo_passo_em"),
      // Negócio aberto sem próximo passo é o que some do radar.
      supabase
        .from("deals")
        .select(`id, nome, amount, stage_id, updated_at, companies:company_id(nome)`)
        .or(filtroDoResponsavel(alvo))
        .eq("status", "open")
        .is("congelado_ate", null)
        .is("proximo_passo_em", null)
        .order("updated_at", { ascending: true })
        .limit(20),
    ]);

    const agora = Date.now();
    return {
      isManager: !!isManager,
      alvo,
      fila: (comPasso ?? []).map((d) => ({
        id: d.id as string,
        nome: (d.nome as string) ?? "",
        empresa: (d.companies as { nome?: string } | null)?.nome ?? null,
        amount: Number(d.amount ?? 0),
        proximoPasso: (d.proximo_passo as string | null) ?? null,
        quando: d.proximo_passo_em as string,
        atrasado: new Date(d.proximo_passo_em as string).getTime() < agora,
      })),
      semProximoPasso: (semPasso ?? []).map((d) => ({
        id: d.id as string,
        nome: (d.nome as string) ?? "",
        empresa: (d.companies as { nome?: string } | null)?.nome ?? null,
        amount: Number(d.amount ?? 0),
        paradoDesde: d.updated_at as string,
      })),
    };
  });

export const MOTIVOS_CONGELAR = [
  "Orçamento previsto para mais adiante",
  "Decisão adiada pelo cliente",
  "Aguardando outro projeto ou evento do cliente",
  "Troca de gestão ou reestruturação no cliente",
] as const;

/**
 * Congela o negócio até uma data: o cliente decide depois do nosso ciclo
 * (orçamento do ano que vem, decisão adiada). Em vez de perda por tempo, o
 * negócio sai do funil ativo e da previsão, e volta sozinho na data, com o
 * próximo passo marcado e aviso para o executivo. `ate` null descongela agora.
 */
export const congelarNegocioSchema = z.object({
  dealId: z.string().uuid(),
  ate: z.string().date().nullable(),
  motivo: z.string().trim().min(3).max(300).optional(),
});

/** Núcleo de congelarNegocio: a mesma regra para a tela e para a assistente. */
export async function congelarNegocioNucleo(
  context: CtxNucleo,
  data: z.infer<typeof congelarNegocioSchema>,
) {
  const { supabase, userId } = context;
  const { data: atual, error: e1 } = await supabase
    .from("deals")
    .select("status, vezes_congelado")
    .eq("id", data.dealId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!atual) throw new Error("Negócio não encontrado");
  const a = atual as unknown as { status: string; vezes_congelado: number | null };
  if (a.status !== "open") throw new Error("Só dá para congelar negócio em aberto");
  const agora = new Date().toISOString();

  let patch: Record<string, unknown>;
  let nota: string;
  if (data.ate) {
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date(Date.now() + 548 * 864e5).toISOString().slice(0, 10);
    if (data.ate <= hoje) throw new Error("A data de retomada precisa ser depois de hoje");
    if (data.ate > limite) throw new Error("Congele por no máximo 18 meses");
    if (!data.motivo) throw new Error("Diga o motivo de congelar");
    const dataBr = data.ate.split("-").reverse().join("/");
    patch = {
      congelado_ate: data.ate,
      congelado_motivo: data.motivo,
      congelado_em: agora,
      congelado_por: userId,
      vezes_congelado: (a.vezes_congelado ?? 0) + 1,
      proximo_passo: `Retomar a negociação (congelado: ${data.motivo})`.slice(0, 500),
      proximo_passo_em: new Date(`${data.ate}T09:00:00-03:00`).toISOString(),
      updated_at: agora,
    };
    nota = `Negócio congelado até ${dataBr} — ${data.motivo}`;
  } else {
    patch = { congelado_ate: null, updated_at: agora };
    nota = "Negócio descongelado antes da data.";
  }
  const { error } = await supabase
    .from("deals")
    .update(patch as never)
    .eq("id", data.dealId);
  if (error) throw new Error(error.message);
  await supabase.from("deal_activities").insert({
    deal_id: data.dealId,
    tipo: "nota",
    descricao: nota,
    occurred_at: agora,
    author_id: userId,
  } as never);
  return { ok: true };
}

export const congelarNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => congelarNegocioSchema.parse(d))
  .handler(async ({ data, context }) => congelarNegocioNucleo(context, data));

/** Texto literal para ilike (sem % e _ virarem curinga). */
const semCuringa = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Fontes que o executivo escolhe ao abrir um negócio por conta própria. */
export const FONTES_NEGOCIO_DO_EXECUTIVO = [
  "Prospecção do executivo",
  "Carteira ativa",
  "Carteira receptiva",
  "Relacionamento",
  "Indicação",
  "Evento",
  "Outro",
] as const;

export const CriarNegocioSchema = z
  .object({
    empresaId: z.string().uuid().nullable(),
    empresaNome: z.string().trim().max(200).default(""),
    tipoEmpresa: z.enum(["empresa", "pessoa_fisica", "consultoria"]).default("empresa"),
    contato: z
      .object({
        nome: z.string().trim().min(1).max(200),
        email: z.string().trim().toLowerCase().email().max(254).nullable(),
        telefone: z.string().trim().max(40).nullable(),
        cargo: z.string().trim().max(120).nullable(),
      })
      .nullable(),
    nome: z.string().trim().max(200).default(""),
    pipelineId: z.string().uuid().nullable(),
    valor: z.number().min(0).max(100_000_000).default(0),
    produtos: z.string().trim().max(1000).nullable(),
    fonte: z.string().trim().max(120).nullable(),
    executivoId: z.string().uuid().nullable(),
    proximoPasso: z.string().trim().max(300).nullable(),
    proximoPassoEm: z.string().datetime().nullable(),
  })
  .refine((d) => d.empresaId || d.empresaNome, "Escolha ou digite a empresa");
export type CriarNegocioInput = z.infer<typeof CriarNegocioSchema>;

/** Núcleo (também usado pela assistente, com o acesso de quem pede). */
export async function criarNegocioNucleo(
  supabase: SupabaseClient,
  userId: string,
  data: CriarNegocioInput,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: pode } = await db.rpc("is_manager", { _user_id: userId });
  const { data: comercial } = await db.rpc("has_team", { _user_id: userId, _team: "comercial" });
  if (!pode && !comercial) throw new Error("Só o comercial abre negócio");
  // Só a gestão abre negócio no nome de outra pessoa.
  const executivo = pode && data.executivoId ? data.executivoId : userId;

  // Empresa: a escolhida ou uma nova (sem duplicar pelo nome exato).
  let companyId = data.empresaId;
  if (!companyId) {
    const { data: mesma } = await db
      .from("companies")
      .select("id")
      .ilike("nome", semCuringa(data.empresaNome))
      .limit(1)
      .maybeSingle();
    if (mesma) companyId = (mesma as { id: string }).id;
    else {
      const { data: nova, error } = await db
        .from("companies")
        .insert({
          nome: data.empresaNome,
          tipo_lead: data.tipoEmpresa,
          owner_user_id: executivo,
          provenance: { origem: "negocio_do_executivo" },
        })
        .select("id")
        .single();
      if (error) throw new Error(`Empresa: ${error.message}`);
      companyId = (nova as { id: string }).id;
    }
  }
  const { data: empresa } = await db.from("companies").select("nome").eq("id", companyId).single();
  const nomeEmpresa = (empresa as { nome: string } | null)?.nome ?? data.empresaNome;

  // Contato: o de mesmo e-mail, se já existe; senão, um novo na empresa.
  let contactId: string | null = null;
  if (data.contato) {
    const c = data.contato;
    if (c.email) {
      const { data: existe } = await db
        .from("contacts")
        .select("id, company_id")
        .ilike("email", semCuringa(c.email))
        .limit(1)
        .maybeSingle();
      if (existe) {
        contactId = (existe as { id: string }).id;
        if (!(existe as { company_id: string | null }).company_id)
          await db.from("contacts").update({ company_id: companyId }).eq("id", contactId);
      }
    }
    if (!contactId) {
      const { data: novo, error } = await db
        .from("contacts")
        .insert({
          nome: c.nome,
          email: c.email,
          emails: c.email ? [c.email] : [],
          telefone: c.telefone,
          phones: c.telefone ? [c.telefone] : [],
          cargo: c.cargo,
          company_id: companyId,
          provenance: { origem: "negocio_do_executivo" },
        })
        .select("id")
        .single();
      if (error) throw new Error(`Contato: ${error.message}`);
      contactId = (novo as { id: string }).id;
    }
    await db
      .from("company_contacts")
      .upsert(
        { company_id: companyId, contact_id: contactId, principal: true },
        { onConflict: "company_id,contact_id", ignoreDuplicates: true },
      );
  }

  // Funil: o escolhido ou Novos Negócios; entra na primeira etapa aberta.
  let pipelineId = data.pipelineId;
  if (!pipelineId) {
    const { data: p } = await db
      .from("pipelines")
      .select("id")
      .eq("slug", "novos-negocios")
      .maybeSingle();
    pipelineId = (p as { id: string } | null)?.id ?? null;
  }
  if (!pipelineId) throw new Error("Funil não encontrado");
  const { data: etapa } = await db
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .eq("kind", "open")
    .order("ordem")
    .limit(1)
    .maybeSingle();
  const { count: ganhos } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "won");

  const { data: negocio, error } = await db
    .from("deals")
    .insert({
      nome: data.nome || nomeEmpresa,
      company_id: companyId,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: (etapa as { id: string } | null)?.id ?? null,
      status: "open",
      amount: data.valor,
      executivo_user_id: executivo,
      owner_user_id: executivo,
      fonte: data.fonte || "Prospecção do executivo",
      tipo_venda: (ganhos ?? 0) > 0 ? "Recompra" : "Cliente novo",
      produtos_texto: data.produtos,
      proximo_passo: data.proximoPasso,
      proximo_passo_em: data.proximoPassoEm,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const dealId = (negocio as { id: string }).id;

  if (contactId)
    await db
      .from("deal_contacts")
      .upsert(
        { deal_id: dealId, contact_id: contactId, principal: true },
        { onConflict: "deal_id,contact_id", ignoreDuplicates: true },
      );
  await db.from("deal_activities").insert({
    deal_id: dealId,
    tipo: "nota",
    descricao: "Negócio aberto pelo executivo no Compass.",
    author_id: userId,
    occurred_at: new Date().toISOString(),
  });
  if (executivo !== userId)
    await notificar(db as Db, userId, {
      para: [executivo],
      tipo: "mencao",
      titulo: `Novo negócio para você: ${data.nome || nomeEmpresa}`,
      corpo: "Aberto pela gestão comercial.",
      link: `/negocio/${dealId}`,
      dealId,
    });
  return { dealId };
}

/**
 * O executivo abre um negócio do zero (prospecção própria, indicação, evento),
 * sem depender do SDR, do CS ou do RD. É o que libera a proposta: ela só nasce
 * de um negócio. Mesma forma do negócio que nasce na passagem do SDR
 * (passar_lead_para_executivo): funil, primeira etapa aberta, Cliente novo ou
 * Recompra, contato principal e uma nota no histórico.
 */
export const criarNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CriarNegocioSchema.parse(d))
  .handler(async ({ data, context }) =>
    criarNegocioNucleo(context.supabase as unknown as SupabaseClient, context.userId, data),
  );

/** O que o formulário de novo negócio precisa: funis, executivos e se é gestão. */
export const opcoesNovoNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [{ data: isManager }, { data: pipelines }] = await Promise.all([
      db.rpc("is_manager", { _user_id: userId }),
      db.from("pipelines").select("id, nome, slug").eq("ativo", true).order("ordem"),
    ]);
    let executivos: Array<{ id: string; nome: string }> = [];
    if (isManager) {
      const { executivosDaAgenda } = await import("@/lib/sdr/executivos-da-agenda");
      const ids = [...new Set([...(await executivosDaAgenda(db)), userId])];
      const { data } = await db.from("profiles").select("id, full_name, email").in("id", ids);
      executivos = (
        (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
      )
        .map((p) => ({ id: p.id, nome: p.full_name || p.email || p.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    }
    return {
      isManager: !!isManager,
      meuId: userId,
      pipelines: (pipelines ?? []) as Array<{ id: string; nome: string; slug: string }>,
      executivos,
    };
  });
