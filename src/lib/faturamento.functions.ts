import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { conferirGanho, resolverPolitica, soDigitos } from "@/lib/faturamento/politica";
import {
  carregarPolitica,
  podeFaturar,
  POLITICA_COLS,
  type Db,
} from "@/lib/faturamento/politica.server";
import { notificar, notificarFaturamento } from "@/lib/notificacoes.server";

/*
 * Módulo Administrativo / Faturamento.
 *
 * O ADM entra quando o executivo dá ganho. Antes, recebia tudo por e-mail,
 * faturava fora e nada voltava ao CRM. Aqui: a política do cliente (que o
 * comercial vê antes de negociar), a fila do que conferir e faturar, as notas
 * com parcelas e o relatório mensal que hoje a Lauren monta à mão.
 *
 * Toda escrita passa pelo cliente do usuário — quem decide é a RLS
 * (pode_faturar: time Administrativo ou gestão). A checagem daqui é só para
 * devolver uma mensagem clara em vez do erro do banco.
 */

const solto = (s: unknown) => s as Db;

const DEAL_FAT_COLS =
  "id, nome, company_id, executivo_user_id, status, amount, tipo_venda, produtos_texto, observacao_adm, ordem_compra_em, ordem_compra_numero, oc_situacao, oc_anexo_url, cnpj_faturamento, emissao_prevista_em, prazo_pagamento, forma_pagamento, parcelas, valor_liquido, contato_faturamento_id, adm_checked_at, adm_checked_by, adm_pendencia, adm_pendencia_em, faturado_em, cs_entregue_em, esteira, closed_at";

async function exigeFaturamento(db: Db, userId: string) {
  if (!(await podeFaturar(db, userId)))
    throw new Error("Só o Administrativo e a gestão mexem no faturamento");
}

// ---------------------------------------------------------------------------
// Política do cliente
// ---------------------------------------------------------------------------

/** Card da política: na empresa, no negócio e no diálogo de ganho. */
export const getPoliticaFaturamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ companyId: z.string().uuid().optional(), uid: z.string().max(40).optional() })
      .refine((v) => v.companyId || v.uid, "Informe a empresa")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let companyId = data.companyId ?? null;
    if (!companyId && data.uid) {
      const { data: c } = await db.from("companies").select("id").eq("uid", data.uid).maybeSingle();
      companyId = (c as { id: string } | null)?.id ?? null;
    }
    const podeEditar = await podeFaturar(db, context.userId);
    if (!companyId) return { encontrada: false as const, podeEditar };
    const r = await carregarPolitica(db, companyId);
    return { encontrada: true as const, podeEditar, companyId, ...r };
  });

const politicaInput = z.object({
  companyId: z.string().uuid(),
  codigo_webmais: z.string().trim().max(40).nullable(),
  exige_oc: z.boolean().nullable(),
  janela_emissao_inicio: z.number().int().min(1).max(31).nullable(),
  janela_emissao_fim: z.number().int().min(1).max(31).nullable(),
  prazo_tipo: z.enum(["dias_apos_emissao", "dia_fixo", "a_vista"]).nullable(),
  prazo_valor: z.number().int().min(0).max(365).nullable(),
  aceita_parcelamento: z.boolean().nullable(),
  forma_pagamento: z.string().trim().max(60).nullable(),
  retencao_iss: z.number().min(0).max(100).nullable(),
  retencao_irrf: z.number().min(0).max(100).nullable(),
  retencao_pis: z.number().min(0).max(100).nullable(),
  retencao_cofins: z.number().min(0).max(100).nullable(),
  retencao_csll: z.number().min(0).max(100).nullable(),
  retencao_inss: z.number().min(0).max(100).nullable(),
  regime_tributario: z.string().trim().max(60).nullable(),
  inscricao_estadual: z.string().trim().max(30).nullable(),
  inscricao_municipal: z.string().trim().max(30).nullable(),
  emails_nf: z.array(z.string().trim().email().max(200)).max(10),
  ficha_url: z.string().trim().url().max(500).nullable(),
  observacoes: z.string().trim().max(2000).nullable(),
});

export const salvarPoliticaFaturamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => politicaInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const { companyId, ...campos } = data;
    if ((campos.janela_emissao_inicio == null) !== (campos.janela_emissao_fim == null))
      throw new Error("A janela de emissão precisa do dia inicial e do final");
    if (campos.prazo_tipo && campos.prazo_tipo !== "a_vista" && campos.prazo_valor == null)
      throw new Error("Informe o prazo de pagamento");

    const { error } = await db.from("company_faturamento").upsert(
      {
        company_id: companyId,
        ...campos,
        codigo_webmais: campos.codigo_webmais || null,
        ficha_recebida_em: campos.ficha_url ? new Date().toISOString() : null,
        updated_by: context.userId,
      },
      { onConflict: "company_id" },
    );
    if (error) {
      if (error.code === "23505") throw new Error("Esse código WebMais já está em outra empresa");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Fila do ADM
// ---------------------------------------------------------------------------
export type EtapaFila = "pendencia" | "a_conferir" | "a_faturar" | "a_receber" | "recebido";

type DealFat = Record<string, unknown> & { id: string; company_id: string | null };
type FaturaRow = {
  id: string;
  deal_id: string;
  numero_nf: string;
  emitida_em: string;
  valor_bruto: number;
  valor_liquido: number;
  status: string;
  fatura_parcelas: Array<{
    id: string;
    numero: number;
    vencimento: string;
    valor: number;
    pago_em: string | null;
  }>;
};

function etapaDoNegocio(d: DealFat, faturas: FaturaRow[]): EtapaFila {
  const validas = faturas.filter((f) => f.status === "emitida");
  if (d.faturado_em && validas.length > 0) {
    const abertas = validas.flatMap((f) => f.fatura_parcelas).filter((p) => !p.pago_em);
    return abertas.length > 0 ? "a_receber" : "recebido";
  }
  if (d.adm_pendencia && !d.adm_checked_at) return "pendencia";
  return d.adm_checked_at ? "a_faturar" : "a_conferir";
}

/**
 * Tudo que está com o ADM: ganhos ainda não faturados (qualquer idade) e os
 * faturados dos últimos 120 dias, para acompanhar o recebimento.
 */
export const listarFilaFaturamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);

    const corte = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
    const { data: deals, error } = await db
      .from("deals")
      .select(`${DEAL_FAT_COLS}, companies:company_id(id, nome, cnpj, parent_company_id)`)
      .eq("status", "won")
      .not("ordem_compra_em", "is", null)
      .or(`faturado_em.is.null,faturado_em.gte.${corte}`)
      .order("ordem_compra_em", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const lista = (deals ?? []) as DealFat[];

    const ids = lista.map((d) => d.id);
    const companyIds = [...new Set(lista.map((d) => d.company_id).filter(Boolean))] as string[];
    const parentIds = [
      ...new Set(
        lista
          .map(
            (d) => (d.companies as { parent_company_id?: string | null } | null)?.parent_company_id,
          )
          .filter(Boolean),
      ),
    ] as string[];

    const [{ data: faturas }, { data: politicas }, { data: profiles }] = await Promise.all([
      ids.length
        ? db
            .from("faturas")
            .select(
              "id, deal_id, numero_nf, emitida_em, valor_bruto, valor_liquido, status, fatura_parcelas(id, numero, vencimento, valor, pago_em)",
            )
            .in("deal_id", ids)
        : Promise.resolve({ data: [] }),
      companyIds.length + parentIds.length
        ? db
            .from("company_faturamento")
            .select(POLITICA_COLS)
            .in("company_id", [...companyIds, ...parentIds])
        : Promise.resolve({ data: [] }),
      db.from("profiles").select("id, full_name, email"),
    ]);

    const fatPorDeal = new Map<string, FaturaRow[]>();
    for (const f of (faturas ?? []) as FaturaRow[]) {
      const arr = fatPorDeal.get(f.deal_id) ?? [];
      arr.push(f);
      fatPorDeal.set(f.deal_id, arr);
    }
    const polPorEmpresa = new Map(
      ((politicas ?? []) as Array<Record<string, unknown>>).map((p) => [p.company_id as string, p]),
    );
    const nome = new Map(
      (
        (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
      ).map((p) => [p.id, p.full_name || p.email || ""]),
    );

    const hoje = new Date().toISOString().slice(0, 10);
    const itens = lista.map((d) => {
      const empresa = d.companies as {
        id: string;
        nome: string;
        cnpj: string | null;
        parent_company_id: string | null;
      } | null;
      const politica = resolverPolitica(
        polPorEmpresa.get(d.company_id ?? "") ?? null,
        empresa?.parent_company_id ? polPorEmpresa.get(empresa.parent_company_id) : null,
      );
      const fats = fatPorDeal.get(d.id) ?? [];
      const parcelasAbertas = fats
        .filter((f) => f.status === "emitida")
        .flatMap((f) => f.fatura_parcelas)
        .filter((p) => !p.pago_em);
      const pendencias = conferirGanho(
        {
          ocSituacao: (d.oc_situacao as never) ?? (d.ordem_compra_numero ? "numero" : null),
          ocNumero: (d.ordem_compra_numero as string | null) ?? null,
          ocAnexoUrl: (d.oc_anexo_url as string | null) ?? null,
          cnpjFaturamento: (d.cnpj_faturamento as string | null) ?? empresa?.cnpj ?? null,
          emissaoPrevistaEm: (d.emissao_prevista_em as string | null) ?? null,
          parcelas: (d.parcelas as number | null) ?? null,
          valor: Number(d.amount ?? 0),
          contatoFaturamento: !!d.contato_faturamento_id || politica.emails_nf.length > 0,
          clienteNovo: /novo/i.test(String(d.tipo_venda ?? "")),
        },
        politica,
      );
      return {
        id: d.id,
        nome: String(d.nome ?? ""),
        empresa: empresa ? { id: empresa.id, nome: empresa.nome } : null,
        executivo: nome.get(d.executivo_user_id as string) ?? null,
        valor: Number(d.amount ?? 0),
        ordemCompraEm: d.ordem_compra_em as string,
        emissaoPrevistaEm: (d.emissao_prevista_em as string | null) ?? null,
        pendenciaAdm: (d.adm_pendencia as string | null) ?? null,
        etapa: etapaDoNegocio(d, fats),
        codigoWebmais: politica.codigo_webmais,
        resumoPendencias: pendencias.map((p) => p.mensagem),
        faturado: fats
          .filter((f) => f.status === "emitida")
          .reduce((s, f) => s + Number(f.valor_bruto), 0),
        aReceber: parcelasAbertas.reduce((s, p) => s + Number(p.valor), 0),
        vencidas: parcelasAbertas.filter((p) => p.vencimento < hoje).length,
      };
    });

    return { itens };
  });

/** Tudo que o ADM precisa para conferir e faturar um negócio. */
export const getFaturamentoNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: deal, error } = await db
      .from("deals")
      .select(DEAL_FAT_COLS)
      .eq("id", data.dealId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deal) throw new Error("Negócio não encontrado");
    const d = deal as DealFat;

    const [pol, { data: faturas }, { data: contatos }, podeEditar] = await Promise.all([
      d.company_id ? carregarPolitica(db, d.company_id) : Promise.resolve(null),
      db
        .from("faturas")
        .select(
          "id, numero_nf, emitida_em, valor_bruto, retencoes, valor_liquido, status, cancelada_motivo, observacao, cnpj, fatura_parcelas(id, numero, vencimento, valor, pago_em)",
        )
        .eq("deal_id", data.dealId)
        .order("emitida_em"),
      d.company_id
        ? db
            .from("contacts")
            .select("id, nome, email, telefone, modulos")
            .eq("company_id", d.company_id)
            .order("nome")
            .limit(100)
        : Promise.resolve({ data: [] }),
      podeFaturar(db, context.userId),
    ]);

    const politica = pol?.efetiva ?? resolverPolitica(null);
    const pendencias = conferirGanho(
      {
        ocSituacao: (d.oc_situacao as never) ?? (d.ordem_compra_numero ? "numero" : null),
        ocNumero: (d.ordem_compra_numero as string | null) ?? null,
        ocAnexoUrl: (d.oc_anexo_url as string | null) ?? null,
        cnpjFaturamento: (d.cnpj_faturamento as string | null) ?? pol?.empresa?.cnpj ?? null,
        emissaoPrevistaEm: (d.emissao_prevista_em as string | null) ?? null,
        parcelas: (d.parcelas as number | null) ?? null,
        valor: Number(d.amount ?? 0),
        contatoFaturamento: !!d.contato_faturamento_id || politica.emails_nf.length > 0,
        clienteNovo: /novo/i.test(String(d.tipo_venda ?? "")),
      },
      politica,
    );

    return {
      // Colunas simples de deals (texto, número, data, booleano).
      negocio: d as Record<string, string | number | boolean | null>,
      empresa: pol?.empresa ?? null,
      matriz: pol?.matriz ?? null,
      politica,
      pendencias,
      contatos: (contatos ?? []) as Array<{
        id: string;
        nome: string | null;
        email: string | null;
        telefone: string | null;
        modulos: string[] | null;
      }>,
      faturas: (faturas ?? []) as Array<
        FaturaRow & {
          retencoes: number;
          cancelada_motivo: string | null;
          observacao: string | null;
          cnpj: string | null;
        }
      >,
      podeEditar,
    };
  });

async function registrarNoHistorico(db: Db, dealId: string, userId: string, texto: string) {
  await db.from("deal_activities").insert({
    deal_id: dealId,
    tipo: "faturamento",
    descricao: texto,
    author_id: userId,
  });
}

/** O ADM conferiu: está tudo certo para faturar. */
export const conferirNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const { error } = await db
      .from("deals")
      .update({
        adm_checked_at: new Date().toISOString(),
        adm_checked_by: context.userId,
        adm_pendencia: null,
        adm_pendencia_em: null,
      })
      .eq("id", data.dealId);
    if (error) throw new Error(error.message);
    await registrarNoHistorico(
      db,
      data.dealId,
      context.userId,
      "ADM conferiu: liberado para faturar.",
    );
    return { ok: true };
  });

/**
 * Falta informação: devolve ao comercial com o que falta. Fica no negócio e
 * no histórico, em vez de voltar por e-mail.
 */
export const devolverAoComercial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dealId: z.string().uuid(), texto: z.string().trim().min(3).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const { error } = await db
      .from("deals")
      .update({
        adm_pendencia: data.texto,
        adm_pendencia_em: new Date().toISOString(),
        adm_checked_at: null,
        adm_checked_by: null,
      })
      .eq("id", data.dealId);
    if (error) throw new Error(error.message);
    await registrarNoHistorico(
      db,
      data.dealId,
      context.userId,
      `Pendência para o comercial: ${data.texto}`,
    );
    const { data: deal } = await db
      .from("deals")
      .select("nome, executivo_user_id")
      .eq("id", data.dealId)
      .maybeSingle();
    const d = deal as { nome: string; executivo_user_id: string | null } | null;
    await notificar(db, context.userId, {
      para: [d?.executivo_user_id],
      tipo: "pendencia_adm",
      titulo: `O ADM precisa de informação para faturar ${d?.nome ?? "a venda"}`,
      corpo: data.texto,
      link: `/negocio/${data.dealId}`,
      dealId: data.dealId,
    });
    return { ok: true };
  });

/**
 * O comercial completa os dados do ganho (sozinho ou respondendo a uma
 * pendência do ADM). Resolver a pendência a tira do negócio.
 */
export const completarDadosGanho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        cnpjFaturamento: z.string().max(20).nullable().optional(),
        ocSituacao: z.enum(["numero", "nao_tem", "anexo"]).optional(),
        ordemCompraNumero: z.string().trim().max(60).nullable().optional(),
        ocAnexoUrl: z.string().trim().url().max(500).nullable().optional(),
        emissaoPrevistaEm: z.string().date().nullable().optional(),
        prazoPagamento: z.string().trim().max(120).nullable().optional(),
        formaPagamento: z.string().trim().max(60).nullable().optional(),
        parcelas: z.number().int().min(1).max(24).nullable().optional(),
        contatoFaturamentoId: z.string().uuid().nullable().optional(),
        resolverPendencia: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const patch: Record<string, unknown> = {};
    const mapa: Record<string, string> = {
      cnpjFaturamento: "cnpj_faturamento",
      ocSituacao: "oc_situacao",
      ordemCompraNumero: "ordem_compra_numero",
      ocAnexoUrl: "oc_anexo_url",
      emissaoPrevistaEm: "emissao_prevista_em",
      prazoPagamento: "prazo_pagamento",
      formaPagamento: "forma_pagamento",
      parcelas: "parcelas",
      contatoFaturamentoId: "contato_faturamento_id",
    };
    for (const [k, col] of Object.entries(mapa)) {
      const v = (data as Record<string, unknown>)[k];
      if (v !== undefined)
        patch[col] = k === "cnpjFaturamento" ? soDigitos(v as string) || null : v;
    }
    if (data.resolverPendencia) {
      patch.adm_pendencia = null;
      patch.adm_pendencia_em = null;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await db.from("deals").update(patch).eq("id", data.dealId);
    if (error) throw new Error(error.message);
    if (data.resolverPendencia) {
      await registrarNoHistorico(
        db,
        data.dealId,
        context.userId,
        "Comercial respondeu a pendência do ADM.",
      );
      await notificarFaturamento(db, {
        tipo: "pendencia_respondida",
        titulo: "O comercial respondeu a pendência de faturamento",
        link: "/faturamento",
        dealId: data.dealId,
      });
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Notas e recebimento
// ---------------------------------------------------------------------------
const parcelaInput = z.object({
  vencimento: z.string().date(),
  valor: z.number().min(0).max(100_000_000),
});

export const registrarFatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        numeroNf: z.string().trim().min(1).max(40),
        emitidaEm: z.string().date(),
        cnpj: z.string().max(20).nullable(),
        valorBruto: z.number().min(0).max(100_000_000),
        retencoes: z.number().min(0).max(100_000_000),
        observacao: z.string().trim().max(1000).nullable(),
        parcelas: z.array(parcelaInput).min(1).max(24),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const liquido = Math.round((data.valorBruto - data.retencoes) * 100) / 100;
    if (liquido < 0) throw new Error("Retenções maiores que o valor da nota");
    const somaParcelas = data.parcelas.reduce((s, p) => s + p.valor, 0);
    if (Math.abs(somaParcelas - liquido) > 0.05)
      throw new Error(
        `As parcelas somam ${somaParcelas.toFixed(2)} e o líquido da nota é ${liquido.toFixed(2)}`,
      );

    const { data: deal } = await db
      .from("deals")
      .select("company_id, adm_checked_at")
      .eq("id", data.dealId)
      .maybeSingle();
    if (!deal) throw new Error("Negócio não encontrado");

    const { data: fatura, error } = await db
      .from("faturas")
      .insert({
        deal_id: data.dealId,
        company_id: (deal as { company_id: string | null }).company_id,
        cnpj: soDigitos(data.cnpj) || null,
        numero_nf: data.numeroNf,
        emitida_em: data.emitidaEm,
        valor_bruto: data.valorBruto,
        retencoes: data.retencoes,
        valor_liquido: liquido,
        observacao: data.observacao,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma nota com esse número e CNPJ");
      throw new Error(error.message);
    }
    const faturaId = (fatura as { id: string }).id;
    const { error: pErr } = await db.from("fatura_parcelas").insert(
      data.parcelas.map((p, i) => ({
        fatura_id: faturaId,
        numero: i + 1,
        vencimento: p.vencimento,
        valor: p.valor,
      })),
    );
    if (pErr) {
      // Sem parcelas a nota fica pela metade: desfaz como cancelada.
      await db
        .from("faturas")
        .update({ status: "cancelada", cancelada_motivo: `Erro nas parcelas: ${pErr.message}` })
        .eq("id", faturaId);
      throw new Error(pErr.message);
    }

    // Faturar implica ter conferido.
    if (!(deal as { adm_checked_at: string | null }).adm_checked_at)
      await db
        .from("deals")
        .update({ adm_checked_at: new Date().toISOString(), adm_checked_by: context.userId })
        .eq("id", data.dealId);

    await registrarNoHistorico(
      db,
      data.dealId,
      context.userId,
      `NF ${data.numeroNf} emitida em ${data.emitidaEm.split("-").reverse().join("/")} — ${data.parcelas.length}x.`,
    );
    return { ok: true, faturaId };
  });

export const cancelarFatura = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ faturaId: z.string().uuid(), motivo: z.string().trim().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const { data: f, error } = await db
      .from("faturas")
      .update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        cancelada_motivo: data.motivo,
      })
      .eq("id", data.faturaId)
      .eq("status", "emitida")
      .select("deal_id, numero_nf")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!f) throw new Error("Nota não encontrada ou já cancelada");
    const nf = f as { deal_id: string; numero_nf: string };
    await registrarNoHistorico(
      db,
      nf.deal_id,
      context.userId,
      `NF ${nf.numero_nf} cancelada: ${data.motivo}`,
    );
    return { ok: true };
  });

/** Marca (ou desmarca, com pagoEm = null) o recebimento de uma parcela. */
export const registrarRecebimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ parcelaId: z.string().uuid(), pagoEm: z.string().date().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const { error } = await db
      .from("fatura_parcelas")
      .update({ pago_em: data.pagoEm })
      .eq("id", data.parcelaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Relatório mensal — o que hoje a Lauren monta à mão
// ---------------------------------------------------------------------------
export const relatorioFaturamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeFaturamento(db, context.userId);
    const [ano, mes] = data.mes.split("-").map(Number);
    const ini = `${data.mes}-01`;
    const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

    const [{ data: notas, error }, { data: recebidas }, { data: abertas }, { data: profiles }] =
      await Promise.all([
        db
          .from("faturas")
          .select(
            "id, numero_nf, emitida_em, valor_bruto, retencoes, valor_liquido, cnpj, deal_id, deals:deal_id(nome, executivo_user_id, tipo_venda), companies:company_id(nome)",
          )
          .eq("status", "emitida")
          .gte("emitida_em", ini)
          .lt("emitida_em", fim)
          .order("emitida_em"),
        db
          .from("fatura_parcelas")
          .select("valor, pago_em, faturas!inner(status)")
          .eq("faturas.status", "emitida")
          .gte("pago_em", ini)
          .lt("pago_em", fim),
        db
          .from("fatura_parcelas")
          .select("valor, vencimento, faturas!inner(status)")
          .eq("faturas.status", "emitida")
          .is("pago_em", null)
          .lt("vencimento", fim),
        db.from("profiles").select("id, full_name, email"),
      ]);
    if (error) throw new Error(error.message);

    const nome = new Map(
      (
        (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
      ).map((p) => [p.id, p.full_name || p.email || ""]),
    );
    const linhas = ((notas ?? []) as Array<Record<string, unknown>>).map((n) => {
      const deal = n.deals as {
        nome?: string;
        executivo_user_id?: string;
        tipo_venda?: string;
      } | null;
      return {
        id: n.id as string,
        dealId: n.deal_id as string,
        numeroNf: n.numero_nf as string,
        emitidaEm: n.emitida_em as string,
        empresa: (n.companies as { nome?: string } | null)?.nome ?? null,
        negocio: deal?.nome ?? null,
        executivo: nome.get(deal?.executivo_user_id ?? "") ?? null,
        tipoVenda: deal?.tipo_venda ?? null,
        cnpj: (n.cnpj as string | null) ?? null,
        bruto: Number(n.valor_bruto),
        retencoes: Number(n.retencoes),
        liquido: Number(n.valor_liquido),
      };
    });

    const porExecutivo = new Map<string, { bruto: number; notas: number }>();
    for (const l of linhas) {
      const k = l.executivo ?? "Sem executivo";
      const cur = porExecutivo.get(k) ?? { bruto: 0, notas: 0 };
      cur.bruto += l.bruto;
      cur.notas += 1;
      porExecutivo.set(k, cur);
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const abertasArr = (abertas ?? []) as Array<{ valor: number; vencimento: string }>;

    return {
      mes: data.mes,
      linhas,
      totais: {
        bruto: linhas.reduce((s, l) => s + l.bruto, 0),
        retencoes: linhas.reduce((s, l) => s + l.retencoes, 0),
        liquido: linhas.reduce((s, l) => s + l.liquido, 0),
        notas: linhas.length,
        recebido: ((recebidas ?? []) as Array<{ valor: number }>).reduce(
          (s, p) => s + Number(p.valor),
          0,
        ),
        vencido: abertasArr
          .filter((p) => p.vencimento < hoje)
          .reduce((s, p) => s + Number(p.valor), 0),
        aVencer: abertasArr
          .filter((p) => p.vencimento >= hoje)
          .reduce((s, p) => s + Number(p.valor), 0),
      },
      porExecutivo: [...porExecutivo.entries()]
        .map(([executivo, v]) => ({ executivo, ...v }))
        .sort((a, b) => b.bruto - a.bruto),
    };
  });
