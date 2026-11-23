import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";
import { soDigitos, cnpjValido } from "@/lib/faturamento/politica";

/*
 * Jornada do faturamento vista do negócio: as etapas (ganho → ficha →
 * conferência → nota → recebimento), as notas anteriores da empresa, o rateio
 * por CNPJ (um negócio faturado em vários CNPJs da mesma conta-mãe) e o
 * pré-preenchimento do ganho para quem já é cliente.
 */
const solto = (s: unknown) => s as SupabaseClient;
const admin = async () =>
  (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;

type DealBase = {
  id: string;
  company_id: string | null;
  executivo_user_id: string | null;
  amount: number | null;
  closed_at: string | null;
};

/** Lê o negócio pelo usuário (a RLS decide se ele pode ver). */
async function negocioVisivel(db: SupabaseClient, dealId: string) {
  const { data, error } = await db
    .from("deals")
    .select("id, company_id, executivo_user_id, amount, closed_at")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Negócio não encontrado");
  return data as DealBase;
}

/** Conta-mãe e todas as filhas (até dois níveis), para o rateio. */
async function familia(adm: SupabaseClient, companyId: string) {
  const { data: c } = await adm
    .from("companies")
    .select("id, nome, cnpj, parent_company_id")
    .eq("id", companyId)
    .maybeSingle();
  const atual = c as {
    id: string;
    nome: string;
    cnpj: string | null;
    parent_company_id: string | null;
  } | null;
  if (!atual) return { raiz: null, empresas: [] };
  const raizId = atual.parent_company_id ?? atual.id;
  const { data: raiz } = await adm
    .from("companies")
    .select("id, nome, cnpj")
    .eq("id", raizId)
    .maybeSingle();
  const { data: filhas } = await adm
    .from("companies")
    .select("id, nome, cnpj")
    .eq("parent_company_id", raizId)
    .order("nome")
    .limit(200);
  const r = raiz as { id: string; nome: string; cnpj: string | null } | null;
  return {
    raiz: r,
    empresas: [
      ...(r ? [r] : []),
      ...((filhas ?? []) as Array<{ id: string; nome: string; cnpj: string | null }>),
    ],
  };
}

export const getJornadaDoNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const deal = await negocioVisivel(db, data.dealId);
    const adm = await admin();
    const desde = (deal.closed_at ?? "").slice(0, 10);

    const [
      { data: ficha },
      { data: pol },
      { data: parcelasLocais },
      { data: caAbertas },
      notas,
      { data: rateio },
      podeEditar,
    ] = await Promise.all([
      deal.company_id
        ? adm
            .from("fichas_cadastrais")
            .select("enviada_em, confirmada_em")
            .eq("company_id", deal.company_id)
            .order("enviada_em", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      deal.company_id
        ? adm
            .from("company_faturamento")
            .select("exige_oc, prazo_tipo, forma_pagamento, emails_nf, updated_by")
            .eq("company_id", deal.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      adm
        .from("fatura_parcelas")
        .select("vencimento, valor, pago_em, faturas!inner(deal_id, status)")
        .eq("faturas.deal_id", data.dealId)
        .neq("faturas.status", "cancelada"),
      deal.company_id
        ? adm
            .from("ca_receber")
            .select("data_vencimento, nao_pago, total, status")
            .eq("company_id", deal.company_id)
            .gt("nao_pago", 0)
            .gte("data_vencimento", desde || "1900-01-01")
        : Promise.resolve({ data: [] }),
      deal.company_id
        ? db.rpc("notas_da_empresa", { _company: deal.company_id })
        : Promise.resolve({ data: [] }),
      db
        .from("deal_faturamento_cnpjs")
        .select(
          "id, company_id, cnpj, valor, ca_venda_numero, ca_nf_status, ca_nf_numeros, ca_valor_faturado, companies:company_id(nome)",
        )
        .eq("deal_id", data.dealId)
        .order("created_at"),
      podeFaturar(db, context.userId),
    ]);

    const hoje = new Date().toISOString().slice(0, 10);
    const locais = (parcelasLocais ?? []) as Array<{
      vencimento: string;
      valor: number;
      pago_em: string | null;
    }>;
    const abertasLocais = locais.filter((p) => !p.pago_em);
    const abertasCa = (
      (caAbertas ?? []) as Array<{
        data_vencimento: string;
        nao_pago: number | null;
        total: number | null;
        status: string | null;
      }>
    ).filter((r) => !["RECEBIDO", "PERDIDO", "RENEGOCIADO"].includes(r.status ?? ""));
    const recebimento = {
      abertas: abertasLocais.length + abertasCa.length,
      vencidas:
        abertasLocais.filter((p) => p.vencimento < hoje).length +
        abertasCa.filter((r) => r.data_vencimento < hoje).length,
      valorAberto:
        abertasLocais.reduce((s, p) => s + Number(p.valor), 0) +
        abertasCa.reduce((s, r) => s + Number(r.nao_pago ?? r.total ?? 0), 0),
      temParcelas: locais.length > 0 || abertasCa.length > 0,
    };
    const f = ficha as { enviada_em: string; confirmada_em: string | null } | null;
    const p = pol as Record<string, unknown> | null;
    const temPolitica =
      !!p &&
      (p.exige_oc != null ||
        p.prazo_tipo != null ||
        !!p.forma_pagamento ||
        ((p.emails_nf as string[] | null) ?? []).length > 0);

    const notasArr = ((notas as { data?: unknown }).data ?? []) as Array<{
      origem: string;
      numero: string | null;
      emitida_em: string | null;
      valor: number | null;
      status: string | null;
    }>;

    let fam: Awaited<ReturnType<typeof familia>> = { raiz: null, empresas: [] };
    if (deal.company_id) fam = await familia(adm, deal.company_id);

    return {
      ficha: f ? { enviadaEm: f.enviada_em, confirmadaEm: f.confirmada_em } : null,
      temPolitica,
      recebimento,
      notasDaEmpresa: notasArr.map((n) => ({
        origem: n.origem,
        numero: n.numero,
        emitidaEm: n.emitida_em,
        valor: n.valor == null ? null : Number(n.valor),
        status: n.status,
      })),
      rateio: ((rateio ?? []) as Array<Record<string, unknown>>).map((l) => ({
        id: String(l.id),
        companyId: (l.company_id as string | null) ?? null,
        empresa: ((l.companies as { nome?: string } | null)?.nome as string | undefined) ?? null,
        cnpj: String(l.cnpj),
        valor: Number(l.valor),
        caVendaNumero: (l.ca_venda_numero as number | null) ?? null,
        caNfStatus: (l.ca_nf_status as string | null) ?? null,
        caNfNumeros: (l.ca_nf_numeros as string | null) ?? null,
        caValorFaturado: l.ca_valor_faturado == null ? null : Number(l.ca_valor_faturado),
      })),
      familia: fam.empresas.map((e) => ({ id: e.id, nome: e.nome, cnpj: e.cnpj })),
      contaMae: fam.raiz ? { id: fam.raiz.id, nome: fam.raiz.nome } : null,
      podeEditarRateio: podeEditar || deal.executivo_user_id === context.userId,
    };
  });

/**
 * Salva o rateio inteiro (substitui as linhas). Lista vazia = fatura num CNPJ
 * só, como antes. CNPJ que ainda não existe vira uma empresa filha da
 * conta-mãe.
 */
export const salvarRateio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        linhas: z
          .array(
            z.object({
              cnpj: z.string().max(20),
              valor: z.number().positive().max(100_000_000),
              nome: z.string().trim().max(200).optional(),
            }),
          )
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const deal = await negocioVisivel(db, data.dealId);
    if (!(await podeFaturar(db, context.userId)) && deal.executivo_user_id !== context.userId)
      throw new Error("Só o executivo do negócio ou o ADM mudam o rateio");
    if (!deal.company_id) throw new Error("Ligue o negócio a uma empresa primeiro");
    const adm = await admin();
    const fam = await familia(adm, deal.company_id);
    const raizId = fam.raiz?.id ?? deal.company_id;
    const porCnpj = new Map(fam.empresas.filter((e) => e.cnpj).map((e) => [e.cnpj!, e.id]));

    const linhas = [];
    const vistos = new Set<string>();
    for (const l of data.linhas) {
      const cnpj = soDigitos(l.cnpj);
      if (!cnpjValido(cnpj)) throw new Error(`CNPJ inválido: ${l.cnpj}`);
      if (vistos.has(cnpj)) throw new Error(`CNPJ repetido no rateio: ${l.cnpj}`);
      vistos.add(cnpj);
      let companyId = porCnpj.get(cnpj) ?? null;
      if (!companyId) {
        // Pode existir fora da família (cadastrada solta): liga à conta-mãe.
        const { data: existe } = await adm
          .from("companies")
          .select("id, parent_company_id")
          .eq("cnpj", cnpj)
          .maybeSingle();
        const e = existe as { id: string; parent_company_id: string | null } | null;
        if (e) {
          companyId = e.id;
          if (!e.parent_company_id && e.id !== raizId)
            await adm.from("companies").update({ parent_company_id: raizId }).eq("id", e.id);
        } else {
          const { data: nova, error } = await adm
            .from("companies")
            .insert({
              nome: l.nome?.trim() || `${fam.raiz?.nome ?? "Filial"} · ${cnpj.slice(8, 12)}`,
              cnpj,
              parent_company_id: raizId,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          companyId = (nova as { id: string }).id;
        }
      }
      linhas.push({
        deal_id: data.dealId,
        company_id: companyId,
        cnpj,
        valor: l.valor,
        created_by: context.userId,
      });
    }

    // Mantém o que a Conta Azul já ligou nas linhas que continuam.
    const { data: atuais } = await adm
      .from("deal_faturamento_cnpjs")
      .select("id, cnpj")
      .eq("deal_id", data.dealId);
    const ficam = new Set(linhas.map((l) => l.cnpj));
    const sair = ((atuais ?? []) as Array<{ id: string; cnpj: string }>)
      .filter((a) => !ficam.has(a.cnpj))
      .map((a) => a.id);
    if (sair.length) await adm.from("deal_faturamento_cnpjs").delete().in("id", sair);
    if (linhas.length) {
      const { error } = await adm
        .from("deal_faturamento_cnpjs")
        .upsert(linhas, { onConflict: "deal_id,cnpj" });
      if (error) throw new Error(error.message);
    } else {
      // Sem rateio: o negócio volta a ser ligado direto a uma venda.
      await adm
        .from("deals")
        .update({ ca_nf_status: null, ca_nf_numeros: null, ca_valor_faturado: null })
        .eq("id", data.dealId)
        .is("ca_venda_id", null);
    }
    return { ok: true, linhas: linhas.length };
  });

/** Último ganho da mesma empresa: para pré-preencher o ganho de quem já é cliente. */
export const ultimoGanhoDaEmpresa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const deal = await negocioVisivel(solto(context.supabase), data.dealId);
    if (!deal.company_id) return null;
    const adm = await admin();
    const { data: ultimo } = await adm
      .from("deals")
      .select(
        "closed_at, cnpj_faturamento, forma_pagamento, prazo_pagamento, parcelas, contato_faturamento_id",
      )
      .eq("company_id", deal.company_id)
      .eq("status", "won")
      .neq("id", data.dealId)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const u = ultimo as {
      closed_at: string;
      cnpj_faturamento: string | null;
      forma_pagamento: string | null;
      prazo_pagamento: string | null;
      parcelas: number | null;
      contato_faturamento_id: string | null;
    } | null;
    if (!u) return null;
    return {
      em: u.closed_at,
      cnpj: u.cnpj_faturamento,
      forma: u.forma_pagamento,
      prazo: u.prazo_pagamento,
      parcelas: u.parcelas,
      contatoId: u.contato_faturamento_id,
    };
  });
