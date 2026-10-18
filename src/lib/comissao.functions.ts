import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";
import { notificar, notificarFaturamento } from "@/lib/notificacoes.server";
import { negociosGanhosNoPeriodo, type NegocioRealizado } from "@/lib/catalogo/realizado.server";
import {
  calcularComissao,
  realizadoDasLinhas,
  REGRA_PADRAO,
  trimestre,
  type LinhaComissao,
  type Regra,
  type Resultado,
} from "@/lib/comissao/calculo";

/*
 * Comissionamento. O executivo acompanha o dele em função da meta; o ADM
 * confere linha a linha, ajusta com justificativa e envia; o executivo aprova
 * ou contesta; o ADM fecha. A integridade (fechado imutável, ajuste depois de
 * enviado reabre, trilha de eventos) está no banco — aqui fica o cálculo e a
 * orquestração.
 */
const solto = (s: unknown) => s as SupabaseClient;
const r2 = (v: number) => Math.round(v * 100) / 100;

async function regraDoAno(db: SupabaseClient, ano: number): Promise<Regra> {
  const { data } = await db
    .from("comissao_regras")
    .select("base_pct, faixas, super_meta_soma, meta_self_guru_mensal")
    .eq("ano", ano)
    .maybeSingle();
  if (!data) return REGRA_PADRAO;
  const d = data as Record<string, unknown>;
  return {
    base_pct: Number(d.base_pct),
    faixas: (d.faixas as Regra["faixas"]) ?? REGRA_PADRAO.faixas,
    super_meta_soma: !!d.super_meta_soma,
    meta_self_guru_mensal: Number(d.meta_self_guru_mensal ?? 0),
  };
}

type Metas = { produto: number; servico: number; valor: number; dividida: boolean };

/** Metas do mês (commercial_goals), somando escopos. Sem divisão, avisa. */
async function metasDoMes(db: SupabaseClient, userId: string, ano: number) {
  const { data } = await db
    .from("commercial_goals")
    .select("periodo, meta_valor, meta_produto, meta_servico")
    .eq("user_id", userId)
    .gte("periodo", `${ano}-01-01`)
    .lt("periodo", `${ano + 1}-01-01`);
  const porMes = new Map<number, Metas>();
  for (const g of (data ?? []) as Array<Record<string, unknown>>) {
    const mes = Number(String(g.periodo).slice(5, 7));
    const cur = porMes.get(mes) ?? { produto: 0, servico: 0, valor: 0, dividida: false };
    cur.valor += Number(g.meta_valor ?? 0);
    if (g.meta_produto != null || g.meta_servico != null) {
      cur.dividida = true;
      cur.produto += Number(g.meta_produto ?? 0);
      cur.servico += Number(g.meta_servico ?? 0);
    }
    porMes.set(mes, cur);
  }
  return porMes;
}

function linhasDosNegocios(ns: NegocioRealizado[]) {
  return ns.flatMap((n) => {
    const base = {
      deal_id: n.id,
      cliente: n.empresa ?? n.nome,
      parcelas: n.parcelas,
      cliente_novo: /novo/i.test(n.tipoVenda ?? ""),
    };
    if (n.itens.length === 0)
      return [{ ...base, item: n.nome, marca: null, tipo: null, valor: r2(n.valor) }];
    return n.itens.map((i) => ({
      ...base,
      item: i.nome,
      marca: i.marca,
      tipo: i.tipo,
      valor: i.total,
    }));
  });
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------
export const getRegrasComissao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ano: z.number().int().min(2020).max(2100) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [regra, podeEditar] = await Promise.all([
      regraDoAno(db, data.ano),
      podeFaturar(db, context.userId),
    ]);
    return { regra, podeEditar };
  });

export const salvarRegrasComissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ano: z.number().int().min(2020).max(2100),
        base_pct: z.number().min(0).max(100),
        faixas: z
          .array(z.object({ min: z.number().min(0).max(1000), fator: z.number().min(0).max(1000) }))
          .min(1)
          .max(20),
        super_meta_soma: z.boolean(),
        meta_self_guru_mensal: z.number().min(0).max(100_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId)))
      throw new Error("Só o Administrativo altera a regra de comissão");
    const { error } = await db.from("comissao_regras").upsert({
      ...data,
      faixas: [...data.faixas].sort((a, b) => a.min - b.min),
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Painel do ano
// ---------------------------------------------------------------------------
export const painelComissao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ano: z.number().int().min(2020).max(2100),
        executivoId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const adm = await podeFaturar(db, context.userId);
    // O executivo só vê o próprio painel, mesmo que peça outro.
    const alvo = adm && data.executivoId ? data.executivoId : context.userId;

    const [regra, metas, ganhos, { data: fechamentos }, executivos] = await Promise.all([
      regraDoAno(db, data.ano),
      metasDoMes(db, alvo, data.ano),
      negociosGanhosNoPeriodo(db, `${data.ano}-01-01`, `${data.ano + 1}-01-01`, alvo),
      db
        .from("comissao_fechamentos")
        .select("*")
        .eq("user_id", alvo)
        .gte("mes", `${data.ano}-01-01`)
        .lt("mes", `${data.ano + 1}-01-01`),
      adm
        ? db
            .from("user_roles")
            .select("user_id")
            .eq("role", "executivo")
            .then(async ({ data: rs }) => {
              const ids = ((rs ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
              if (!ids.length) return [];
              const { data: ps } = await db
                .from("profiles")
                .select("id, full_name, email")
                .in("id", ids);
              return (
                (ps ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
              )
                .map((p) => ({ id: p.id, nome: p.full_name || p.email || p.id }))
                .sort((a, b) => a.nome.localeCompare(b.nome));
            })
        : Promise.resolve([] as Array<{ id: string; nome: string }>),
    ]);

    const fechPorMes = new Map(
      ((fechamentos ?? []) as Array<Record<string, unknown>>).map((f) => [
        Number(String(f.mes).slice(5, 7)),
        f,
      ]),
    );

    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const f = fechPorMes.get(mes);
      const m = metas.get(mes) ?? { produto: 0, servico: 0, valor: 0, dividida: false };
      if (f) {
        const res = calcularComissao(
          {
            metaProduto: Number(f.meta_produto),
            metaServico: Number(f.meta_servico),
            realizadoProduto: Number(f.realizado_produto),
            realizadoServico: Number(f.realizado_servico),
          },
          regra,
        );
        return {
          mes,
          fonte: "fechamento" as const,
          fechamentoId: f.id as string,
          status: f.status as string,
          metaSemDivisao: false,
          realizadoSelfGuru: Number(f.realizado_self_guru),
          semTipo: Number(f.sem_tipo),
          resultado: res,
        };
      }
      const doMes = ganhos.filter((n) => Number(n.dataGanho.slice(5, 7)) === mes);
      const real = realizadoDasLinhas(
        linhasDosNegocios(doMes).map((l) => ({
          marca: l.marca,
          tipo: l.tipo,
          valor_considerado: l.valor,
          excluida: false,
        })),
      );
      return {
        mes,
        fonte: "previa" as const,
        fechamentoId: null,
        status: "previa",
        metaSemDivisao: m.valor > 0 && !m.dividida,
        realizadoSelfGuru: real.selfGuru,
        semTipo: real.semTipo,
        resultado: calcularComissao(
          {
            metaProduto: m.produto,
            metaServico: m.servico,
            realizadoProduto: real.produto,
            realizadoServico: real.servico,
          },
          regra,
        ),
      };
    });

    const somaQ = (q: number) => {
      const ms = meses.filter((x) => trimestre(x.mes) === q);
      const s = (fn: (r: Resultado) => number) => r2(ms.reduce((a, x) => a + fn(x.resultado), 0));
      return {
        q,
        metaProduto: s((r) => r.produto.meta),
        realizadoProduto: s((r) => r.produto.realizado),
        metaServico: s((r) => r.servico.meta),
        realizadoServico: s((r) => r.servico.realizado),
        total: s((r) => r.total),
      };
    };

    return {
      podeEditar: adm,
      alvo,
      executivos,
      regra,
      meses,
      trimestres: [1, 2, 3, 4].map(somaQ),
      totalAno: r2(meses.reduce((a, x) => a + x.resultado.total, 0)),
    };
  });

// ---------------------------------------------------------------------------
// Fechamento do mês
// ---------------------------------------------------------------------------
async function recalcular(db: SupabaseClient, fechamentoId: string) {
  const { data: f } = await db
    .from("comissao_fechamentos")
    .select("id, mes, status, meta_produto, meta_servico")
    .eq("id", fechamentoId)
    .maybeSingle();
  if (!f) throw new Error("Fechamento não encontrado");
  const fech = f as { mes: string; status: string; meta_produto: number; meta_servico: number };
  if (fech.status === "fechado") return;
  const [{ data: linhas }, regra] = await Promise.all([
    db
      .from("comissao_linhas")
      .select("marca, tipo, valor_considerado, excluida")
      .eq("fechamento_id", fechamentoId),
    regraDoAno(db, Number(fech.mes.slice(0, 4))),
  ]);
  const real = realizadoDasLinhas((linhas ?? []) as LinhaComissao[]);
  const res = calcularComissao(
    {
      metaProduto: Number(fech.meta_produto),
      metaServico: Number(fech.meta_servico),
      realizadoProduto: real.produto,
      realizadoServico: real.servico,
    },
    regra,
  );
  const { error } = await db
    .from("comissao_fechamentos")
    .update({
      realizado_produto: real.produto,
      realizado_servico: real.servico,
      realizado_self_guru: real.selfGuru,
      sem_tipo: real.semTipo,
      comissao_produto: res.produto.comissao,
      comissao_servico: res.servico.comissao,
      super_meta: res.superMeta,
      total: res.total,
    })
    .eq("id", fechamentoId);
  if (error) throw new Error(error.message);
}

async function exigeAdm(db: SupabaseClient, userId: string) {
  if (!(await podeFaturar(db, userId)))
    throw new Error("Só o Administrativo mexe no fechamento de comissão");
}

/**
 * Gera (ou atualiza) o fechamento do mês a partir dos negócios ganhos.
 * Linhas ajustadas pelo ADM (conferidas, excluídas, valor alterado) e linhas
 * manuais são preservadas; as demais acompanham o CRM.
 */
export const gerarFechamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ executivoId: z.string().uuid(), mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    const ano = Number(data.mes.slice(0, 4));
    const mesNum = Number(data.mes.slice(5, 7));
    const ini = `${data.mes}-01`;
    const fim = new Date(Date.UTC(ano, mesNum, 1)).toISOString().slice(0, 10);
    const [metas, regra, ganhos] = await Promise.all([
      metasDoMes(db, data.executivoId, ano),
      regraDoAno(db, ano),
      negociosGanhosNoPeriodo(db, ini, fim, data.executivoId),
    ]);
    const m = metas.get(mesNum) ?? { produto: 0, servico: 0, valor: 0, dividida: false };

    const { data: existente } = await db
      .from("comissao_fechamentos")
      .select("id, status")
      .eq("user_id", data.executivoId)
      .eq("mes", ini)
      .maybeSingle();
    let id = (existente as { id: string } | null)?.id ?? null;
    if ((existente as { status: string } | null)?.status === "fechado")
      throw new Error("Este mês já está fechado");
    if (!id) {
      const { data: novo, error } = await db
        .from("comissao_fechamentos")
        .insert({
          user_id: data.executivoId,
          mes: ini,
          meta_produto: m.produto,
          meta_servico: m.servico,
          meta_self_guru: regra.meta_self_guru_mensal,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = (novo as { id: string }).id;
    } else {
      await db
        .from("comissao_fechamentos")
        .update({ meta_produto: m.produto, meta_servico: m.servico })
        .eq("id", id);
    }

    const { data: atuais } = await db
      .from("comissao_linhas")
      .select("id, deal_id, item, origem, conferida, excluida, valor_original, valor_considerado")
      .eq("fechamento_id", id);
    const lista = (atuais ?? []) as Array<{
      id: string;
      deal_id: string | null;
      item: string;
      origem: string;
      conferida: boolean;
      excluida: boolean;
      valor_original: number;
      valor_considerado: number;
    }>;
    const chave = (dealId: string | null, item: string) => `${dealId}|${item}`;
    const mexida = (l: (typeof lista)[number]) =>
      l.origem === "manual" ||
      l.conferida ||
      l.excluida ||
      Number(l.valor_original) !== Number(l.valor_considerado);
    const existentes = new Map(lista.map((l) => [chave(l.deal_id, l.item), l]));
    const novas = linhasDosNegocios(ganhos);
    const chavesNovas = new Set(novas.map((l) => chave(l.deal_id, l.item)));

    const inserir = novas
      .filter((l) => !existentes.has(chave(l.deal_id, l.item)))
      .map((l) => ({
        fechamento_id: id,
        deal_id: l.deal_id,
        cliente: l.cliente,
        item: l.item,
        marca: l.marca,
        tipo: l.tipo,
        valor_original: l.valor,
        valor_considerado: l.valor,
        parcelas: l.parcelas,
        cliente_novo: l.cliente_novo,
      }));
    if (inserir.length) {
      const { error } = await db.from("comissao_linhas").insert(inserir);
      if (error) throw new Error(error.message);
    }
    // valor mudou no CRM e a linha não foi tocada: acompanha
    for (const l of novas) {
      const e = existentes.get(chave(l.deal_id, l.item));
      if (e && !mexida(e) && Number(e.valor_original) !== l.valor)
        await db
          .from("comissao_linhas")
          .update({
            valor_original: l.valor,
            valor_considerado: l.valor,
            tipo: l.tipo,
            marca: l.marca,
          })
          .eq("id", e.id);
    }
    const remover = lista
      .filter(
        (l) => l.origem === "sistema" && !mexida(l) && !chavesNovas.has(chave(l.deal_id, l.item)),
      )
      .map((l) => l.id);
    if (remover.length) await db.from("comissao_linhas").delete().in("id", remover);

    await recalcular(db, id);
    return { id };
  });

export const getFechamentoComissao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: f, error }, { data: linhas }, { data: eventos }, { data: perfis }, adm] =
      await Promise.all([
        db.from("comissao_fechamentos").select("*").eq("id", data.id).maybeSingle(),
        db
          .from("comissao_linhas")
          .select("*")
          .eq("fechamento_id", data.id)
          .order("cliente")
          .order("item"),
        db
          .from("comissao_eventos")
          .select("id, autor, acao, created_at, antes, depois")
          .eq("fechamento_id", data.id)
          .order("id", { ascending: false })
          .limit(200),
        db.from("profiles").select("id, full_name, email"),
        podeFaturar(db, context.userId),
      ]);
    if (error) throw new Error(error.message);
    if (!f) throw new Error("Fechamento não encontrado");
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || ""],
      ),
    );
    const fech = f as Record<string, string | number | boolean | null>;
    const regra = await regraDoAno(db, Number(String(fech.mes).slice(0, 4)));
    return {
      fechamento: fech,
      executivo: nome.get(String(fech.user_id)) ?? null,
      regra,
      linhas: (linhas ?? []) as Array<Record<string, string | number | boolean | null>>,
      eventos: ((eventos ?? []) as Array<Record<string, unknown>>).map((e) => ({
        id: Number(e.id),
        autor: nome.get(e.autor as string) ?? "sistema",
        acao: e.acao as string,
        quando: e.created_at as string,
        resumo: resumoEvento(
          e.acao as string,
          e.antes as Record<string, unknown> | null,
          e.depois as Record<string, unknown> | null,
        ),
      })),
      podeEditar: adm,
      souDono: fech.user_id === context.userId,
    };
  });

function resumoEvento(
  acao: string,
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): string {
  if (acao.startsWith("linha_")) {
    const l = depois ?? antes ?? {};
    const partes: string[] = [String(l.item ?? "")];
    if (antes && depois) {
      if (antes.valor_considerado !== depois.valor_considerado)
        partes.push(`valor ${antes.valor_considerado} → ${depois.valor_considerado}`);
      if (antes.excluida !== depois.excluida)
        partes.push(depois.excluida ? "excluída" : "reincluída");
      if (antes.conferida !== depois.conferida)
        partes.push(depois.conferida ? "conferida" : "desconferida");
      if (depois.ajuste_motivo && antes.ajuste_motivo !== depois.ajuste_motivo)
        partes.push(`motivo: ${depois.ajuste_motivo}`);
    }
    return partes.filter(Boolean).join(" · ");
  }
  if (acao === "status_contestado" && depois?.contestacao) return String(depois.contestacao);
  if (acao === "recalculado" && antes && depois && antes.total !== depois.total)
    return `total ${antes.total} → ${depois.total}`;
  return "";
}

export const ajustarLinhaComissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        linhaId: z.string().uuid(),
        conferida: z.boolean().optional(),
        excluida: z.boolean().optional(),
        valorConsiderado: z.number().min(0).max(100_000_000).optional(),
        tipo: z.enum(["produto", "servico"]).nullable().optional(),
        motivo: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    const patch: Record<string, unknown> = {};
    if (data.conferida !== undefined) patch.conferida = data.conferida;
    if (data.excluida !== undefined) patch.excluida = data.excluida;
    if (data.valorConsiderado !== undefined) patch.valor_considerado = data.valorConsiderado;
    if (data.tipo !== undefined) patch.tipo = data.tipo;
    if (data.motivo !== undefined) patch.ajuste_motivo = data.motivo || null;
    const { data: l, error } = await db
      .from("comissao_linhas")
      .update(patch)
      .eq("id", data.linhaId)
      .select("fechamento_id")
      .maybeSingle();
    if (error) {
      if (error.message.includes("check"))
        throw new Error("Alterar valor ou excluir pede o motivo");
      throw new Error(error.message);
    }
    if (l) await recalcular(db, (l as { fechamento_id: string }).fechamento_id);
    return { ok: true };
  });

export const adicionarLinhaComissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fechamentoId: z.string().uuid(),
        cliente: z.string().trim().min(1).max(160),
        item: z.string().trim().min(1).max(160),
        marca: z.string().trim().max(40).nullable(),
        tipo: z.enum(["produto", "servico"]),
        valor: z.number().min(0).max(100_000_000),
        motivo: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    const { error } = await db.from("comissao_linhas").insert({
      fechamento_id: data.fechamentoId,
      cliente: data.cliente,
      item: data.item,
      marca: data.marca,
      tipo: data.tipo,
      valor_original: data.valor,
      valor_considerado: data.valor,
      origem: "manual",
      conferida: true,
      ajuste_motivo: data.motivo,
    });
    if (error) throw new Error(error.message);
    await recalcular(db, data.fechamentoId);
    return { ok: true };
  });

/** ADM conferiu: manda para o executivo aprovar. */
export const enviarComissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    await recalcular(db, data.id);
    const { data: pendentes } = await db
      .from("comissao_linhas")
      .select("id")
      .eq("fechamento_id", data.id)
      .eq("conferida", false)
      .eq("excluida", false);
    if ((pendentes ?? []).length > 0)
      throw new Error(`Faltam ${(pendentes ?? []).length} linha(s) para conferir`);
    const { data: f, error } = await db
      .from("comissao_fechamentos")
      .update({ status: "conferido_adm", enviado_em: new Date().toISOString(), contestacao: null })
      .eq("id", data.id)
      .in("status", ["aberto", "contestado"])
      .select("user_id, mes, total")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!f) throw new Error("Este fechamento não está em aberto");
    const fe = f as { user_id: string; mes: string; total: number };
    await notificar(db, context.userId, {
      para: [fe.user_id],
      tipo: "comissao",
      titulo: `Sua comissão de ${fe.mes.slice(5, 7)}/${fe.mes.slice(0, 4)} está pronta para aprovar`,
      corpo: `Total: R$ ${Number(fe.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      link: "/comissao",
    });
    return { ok: true };
  });

/** Executivo aprova ou contesta (função no banco: só o dono responde). */
export const responderComissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        aprova: z.boolean(),
        texto: z.string().max(4000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { error } = await db.rpc("comissao_responder", {
      _fechamento: data.id,
      _aprova: data.aprova,
      _texto: data.texto,
    });
    if (error) throw new Error(error.message);
    await notificarFaturamento(db, {
      tipo: "comissao",
      titulo: data.aprova ? "Executivo aprovou a comissão" : "Executivo contestou a comissão",
      corpo: data.aprova ? null : data.texto,
      link: "/comissao",
    });
    return { ok: true };
  });

/** Fecha o mês: só depois da aprovação do executivo (o banco confere). */
export const fecharComissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    const { error } = await db
      .from("comissao_fechamentos")
      .update({
        status: "fechado",
        fechado_em: new Date().toISOString(),
        fechado_por: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
