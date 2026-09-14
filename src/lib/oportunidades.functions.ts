import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * A ponte da carteira: o CS sinaliza, o card cai no funil do executivo.
 *
 * A oportunidade nasce no CS — é o analista que percebe que os créditos
 * acabaram ou que existe uma dor que outro produto resolve. Mas ela não fica
 * numa caixa de entrada esperando alguém abrir: vira card no funil de carteira
 * na hora, na primeira etapa, no nome do responsável comercial da conta. O
 * executivo recebe onde já trabalha, e o número fica com quem vende.
 */

/** Qual funil cada tipo de sinalização abre. */
export const FUNIL_POR_TIPO: Record<string, string> = {
  // Já usa e vai comprar mais do mesmo: funil curto, não há o que descobrir.
  recompra: "up-sell-recompra",
  // Produto que ainda não tem: funil longo, com agenda de necessidade e pesquisa.
  cross_sell: "cross-sell-cliente",
  // Renovação do contrato entra no de recompra até existir funil próprio.
  renovacao: "up-sell-recompra",
};

export const TIPOS_OPORTUNIDADE = [
  {
    valor: "recompra",
    rotulo: "Recompra",
    ajuda: "O cliente já usa e vai comprar mais do mesmo. Créditos acabando, licença maior.",
  },
  {
    valor: "cross_sell",
    rotulo: "Cross sell",
    ajuda: "Outro produto ou serviço do portfólio, que o cliente ainda não tem.",
  },
  {
    valor: "renovacao",
    rotulo: "Renovação",
    ajuda: "Renovação do contrato, nos dois últimos meses da jornada.",
  },
] as const;

/**
 * O analista de CS sinaliza — e a sinalização já entra como card no funil.
 *
 * A primeira etapa do cross sell chama "Clientes selecionados", e só a quarta
 * é "Oportunidade (negócio criado)". O próprio desenho do funil prevê o
 * cliente entrando como seleção, então é ali que a sinalização cai, no nome do
 * executivo que já é o responsável comercial daquela conta. Assim ele recebe
 * onde trabalha, em vez de numa caixa de entrada à parte.
 *
 * Quando a conta não tem responsável comercial, o card nasce sem dono e fica
 * na fila para alguém assumir.
 */
export const sinalizarOportunidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        tipo: z.enum(["recompra", "cross_sell", "renovacao"]),
        motivo: z.string().min(3).max(1000),
        produtoSugerido: z.string().max(200).nullable().optional(),
        valorEstimado: z.number().min(0).max(100_000_000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cliente, error: cliErr } = await supabase
      .from("cs_clients")
      .select("nome_empresa, company_id, comercial_responsavel_id")
      .eq("client_uid", data.clientUid)
      .maybeSingle();
    if (cliErr) throw new Error(cliErr.message);
    if (!cliente) throw new Error("Cliente não encontrado");

    const dono = (cliente.comercial_responsavel_id as string | null) ?? null;
    const { dealId } = await criarNegocioDaSinalizacao(supabase, {
      clientUid: data.clientUid,
      empresa: (cliente.nome_empresa as string) ?? data.clientUid,
      companyId: (cliente.company_id as string | null) ?? null,
      tipo: data.tipo,
      motivo: data.motivo.trim(),
      produtoSugerido: data.produtoSugerido?.trim() || null,
      valorEstimado: data.valorEstimado ?? null,
      executivoId: dono,
      autorId: userId,
    });

    const agora = new Date().toISOString();
    const { error } = await supabase.from("cs_oportunidades").insert({
      client_uid: data.clientUid,
      tipo: data.tipo,
      motivo: data.motivo.trim(),
      produto_sugerido: data.produtoSugerido?.trim() || null,
      valor_estimado: data.valorEstimado ?? null,
      sinalizada_por: userId,
      // Com dono definido o card já nasce atribuído; sem dono, fica na fila.
      status: dono ? "assumida" : "aberta",
      assumida_por: dono,
      assumida_em: dono ? agora : null,
      deal_id: dealId,
    } as never);
    if (error) throw new Error(error.message);

    // Fica na linha do tempo do cliente, para o CS ver o que já sinalizou.
    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "nota",
      title: `Oportunidade sinalizada ao comercial (${data.tipo === "cross_sell" ? "cross sell" : data.tipo})`,
      description: data.motivo.trim(),
      occurred_at: agora,
    } as never);

    return { ok: true, dealId, temDono: !!dono };
  });

/** Cria o card no funil que o tipo determina, na primeira etapa. */
async function criarNegocioDaSinalizacao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: {
    clientUid: string;
    empresa: string;
    companyId: string | null;
    tipo: string;
    motivo: string;
    produtoSugerido: string | null;
    valorEstimado: number | null;
    executivoId: string | null;
    autorId: string;
  },
): Promise<{ dealId: string }> {
  const slug = FUNIL_POR_TIPO[input.tipo] ?? "up-sell-recompra";

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!pipeline) throw new Error(`Funil "${slug}" não encontrado`);

  const { data: etapa } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .eq("kind", "open")
    .order("ordem")
    .limit(1)
    .maybeSingle();

  const rotulo = input.produtoSugerido || (input.tipo === "cross_sell" ? "Cross sell" : "Recompra");
  const { data: negocio, error } = await supabase
    .from("deals")
    .insert({
      nome: `${rotulo} — ${input.empresa}`,
      company_id: input.companyId,
      executivo_user_id: input.executivoId,
      pipeline_id: pipeline.id,
      stage_id: etapa?.id ?? null,
      status: "open",
      amount: input.valorEstimado ?? 0,
      fonte: "Sinalização do CS",
      tipo_venda: input.tipo === "cross_sell" ? "Cross sell" : "Recompra",
      produtos_texto: input.produtoSugerido,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const dealId = (negocio as { id: string }).id;

  // O contexto do CS abre o histórico do negócio.
  await supabase.from("deal_activities").insert({
    deal_id: dealId,
    tipo: "nota",
    descricao: `Oportunidade sinalizada pelo CS: ${input.motivo}`,
    author_id: input.autorId,
    occurred_at: new Date().toISOString(),
  } as never);

  return { dealId };
}

/** Sinalizações de um cliente, para a ficha dele no CS. */
export const listOportunidadesDoCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      supabase
        .from("cs_oportunidades")
        .select("*")
        .eq("client_uid", data.clientUid)
        .order("sinalizada_em", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );
    return {
      oportunidades: (rows ?? []).map((o) => ({
        id: o.id as string,
        tipo: o.tipo as string,
        motivo: o.motivo as string,
        produtoSugerido: (o.produto_sugerido as string | null) ?? null,
        valorEstimado: o.valor_estimado == null ? null : Number(o.valor_estimado),
        status: o.status as string,
        sinalizadaEm: o.sinalizada_em as string,
        sinalizadaPor: nomeDe.get(o.sinalizada_por as string) ?? null,
        assumidaPor: nomeDe.get(o.assumida_por as string) ?? null,
        dealId: (o.deal_id as string | null) ?? null,
      })),
    };
  });

/**
 * O que chegou do CS para o executivo.
 *
 * São duas listas, não uma: as que já são dele — a conta tem responsável
 * comercial, então o card nasceu no nome dele e ele só precisa saber que
 * chegou — e as sem dono, que ainda dependem de alguém assumir.
 *
 * Some da lista quando o negócio sai da primeira etapa ou fecha: a partir daí
 * ele é um negócio como outro qualquer, e o lugar de trabalhar é o funil.
 */
export const listOportunidadesAbertas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      supabase
        .from("cs_oportunidades")
        .select("*, cs_clients:client_uid(nome_empresa, company_id, cs_responsavel_id)")
        .in("status", ["aberta", "assumida"])
        .gte("sinalizada_em", desde)
        .order("sinalizada_em", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);

    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );

    // O estado do card no funil decide se ainda é "chegou do CS" ou já é trabalho em curso.
    const ids = (rows ?? []).map((o) => o.deal_id as string | null).filter(Boolean) as string[];
    const negocios = new Map<
      string,
      { stageId: string | null; status: string; primeira: boolean }
    >();
    if (ids.length) {
      const { data: deals } = await supabase
        .from("deals")
        .select("id, stage_id, status, pipeline_id")
        .in("id", ids);
      const pipelines = [
        ...new Set((deals ?? []).map((d: { pipeline_id: string | null }) => d.pipeline_id)),
      ].filter(Boolean) as string[];
      const primeiraDoFunil = new Map<string, string | null>();
      if (pipelines.length) {
        const { data: etapas } = await supabase
          .from("pipeline_stages")
          .select("id, pipeline_id, ordem, kind")
          .in("pipeline_id", pipelines)
          .eq("kind", "open")
          .order("ordem");
        for (const e of etapas ?? []) {
          const pid = e.pipeline_id as string;
          if (!primeiraDoFunil.has(pid)) primeiraDoFunil.set(pid, e.id as string);
        }
      }
      for (const d of deals ?? []) {
        const row = d as {
          id: string;
          stage_id: string | null;
          status: string;
          pipeline_id: string | null;
        };
        negocios.set(row.id, {
          stageId: row.stage_id,
          status: row.status,
          primeira: !!row.pipeline_id && primeiraDoFunil.get(row.pipeline_id) === row.stage_id,
        });
      }
    }

    const item = (o: Record<string, unknown>) => {
      const cliente = o.cs_clients as {
        nome_empresa?: string;
        company_id?: string | null;
        cs_responsavel_id?: string | null;
      } | null;
      return {
        id: o.id as string,
        clientUid: o.client_uid as string,
        empresa: cliente?.nome_empresa ?? (o.client_uid as string),
        tipo: o.tipo as string,
        motivo: o.motivo as string,
        produtoSugerido: (o.produto_sugerido as string | null) ?? null,
        valorEstimado: o.valor_estimado == null ? null : Number(o.valor_estimado),
        sinalizadaEm: o.sinalizada_em as string,
        sinalizadaPor: nomeDe.get(o.sinalizada_por as string) ?? null,
        analistaCs: nomeDe.get(cliente?.cs_responsavel_id as string) ?? null,
        dealId: (o.deal_id as string | null) ?? null,
        funil: FUNIL_POR_TIPO[o.tipo as string] ?? null,
      };
    };

    const minhas: ReturnType<typeof item>[] = [];
    const semDono: ReturnType<typeof item>[] = [];
    for (const o of rows ?? []) {
      const negocio = o.deal_id ? negocios.get(o.deal_id as string) : null;
      // Já andou no funil ou fechou: virou negócio comum, sai do aviso.
      if (negocio && (negocio.status !== "open" || !negocio.primeira)) continue;
      if (o.status === "aberta") semDono.push(item(o));
      else if (o.assumida_por === userId) minhas.push(item(o));
    }

    // A lista antiga era só a fila; mantida para quem ainda lê `oportunidades`.
    return { minhas, semDono, oportunidades: semDono };
  });

/**
 * Assume uma sinalização que ficou sem dono. O card já existe no funil desde a
 * sinalização; aqui ele passa a ser do executivo que assumiu.
 */
export const assumirOportunidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: op, error: opErr } = await supabase
      .from("cs_oportunidades")
      .select("id, status, deal_id")
      .eq("id", data.id)
      .maybeSingle();
    if (opErr) throw new Error(opErr.message);
    if (!op) throw new Error("Oportunidade não encontrada");
    if (op.status === "assumida") throw new Error("Esta oportunidade já tem dono");
    if (op.status === "descartada") throw new Error("Esta oportunidade foi descartada");
    const dealId = op.deal_id as string | null;
    if (!dealId) throw new Error("Sinalização sem negócio ligado");

    const agora = new Date().toISOString();
    const { error: dealErr } = await supabase
      .from("deals")
      .update({ executivo_user_id: userId, updated_at: agora } as never)
      .eq("id", dealId);
    if (dealErr) throw new Error(dealErr.message);

    await supabase
      .from("cs_oportunidades")
      .update({
        status: "assumida",
        assumida_por: userId,
        assumida_em: agora,
        updated_at: agora,
      } as never)
      .eq("id", data.id);

    return { ok: true, dealId };
  });

export const descartarOportunidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), motivo: z.string().min(2).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("cs_oportunidades")
      .update({
        status: "descartada",
        descartada_motivo: data.motivo.trim(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
