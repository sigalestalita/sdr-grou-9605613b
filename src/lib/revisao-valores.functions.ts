import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Revisão de valores de negócios antigos (/revisao-valores). O campo "[backup] Valor"
 * do RD perdeu a vírgula dos centavos (R$ 2.456,10 virou 24561). A lista está em
 * revisao_valores (montada pela migração 20261127130000); quem revisa escolhe ÷10,
 * ÷100, manter ou outro valor, e a decisão já corrige o negócio. Gestão e ADM.
 */
const solto = (s: unknown) => s as SupabaseClient;

async function podeRevisar(db: SupabaseClient, userId: string) {
  const [{ data: gestor }, { data: adm }] = await Promise.all([
    db.rpc("is_manager", { _user_id: userId }),
    db.rpc("has_team", { _user_id: userId, _team: "administrativo" }),
  ]);
  return !!gestor || !!adm;
}

export type LinhaRevisao = {
  dealId: string;
  rdDealId: string | null;
  empresa: string | null;
  companyId: string | null;
  negocio: string | null;
  produto: string | null;
  fechadoEm: string | null;
  valorOriginal: number;
  precoTipico: number | null;
  sugestao: number | null;
  status: "pendente" | "corrigido" | "mantido";
  valorFinal: number | null;
  revisadoPor: string | null;
  revisadoEm: string | null;
};

export const listarRevisaoValores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["pendente", "corrigido", "mantido", "todos"]).default("pendente"),
        busca: z.string().trim().max(80).default(""),
        pagina: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeRevisar(db, context.userId)))
      throw new Error("Só a gestão e o administrativo revisam valores");
    const POR_PAGINA = 50;
    let q = db
      .from("revisao_valores")
      .select(
        "deal_id, rd_deal_id, empresa, company_id, negocio, produto, fechado_em, valor_original, preco_tipico, sugestao, status, valor_final, revisado_por, revisado_em",
        { count: "exact" },
      )
      .order("valor_original", { ascending: false })
      .range(data.pagina * POR_PAGINA, data.pagina * POR_PAGINA + POR_PAGINA - 1);
    if (data.status !== "todos") q = q.eq("status", data.status);
    const termo = data.busca.replace(/[,()*%\\]/g, " ").trim();
    if (termo.length >= 2)
      q = q.or(`empresa.ilike.%${termo}%,negocio.ilike.%${termo}%,produto.ilike.%${termo}%`);
    const contar = (st: string) =>
      db.from("revisao_valores").select("deal_id", { count: "exact", head: true }).eq("status", st);
    const [{ data: linhas, error, count }, pend, corr, mant, { data: perfis }] = await Promise.all([
      q,
      contar("pendente"),
      contar("corrigido"),
      contar("mantido"),
      db.from("profiles").select("id, full_name, email"),
    ]);
    // Soma do que já foi revisado (em páginas: o banco devolve no máximo 1000 linhas por vez).
    const revisados: Array<{ valor_original: number; valor_final: number | null }> = [];
    for (let de = 0; de < 20000; de += 1000) {
      const { data: pg } = await db
        .from("revisao_valores")
        .select("valor_original, valor_final")
        .neq("status", "pendente")
        .order("deal_id")
        .range(de, de + 999);
      const lote = (pg ?? []) as Array<{ valor_original: number; valor_final: number | null }>;
      revisados.push(...lote);
      if (lote.length < 1000) break;
    }
    if (error) throw new Error(error.message);
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || "—"],
      ),
    );
    const tot = {
      pendente: pend.count ?? 0,
      corrigido: corr.count ?? 0,
      mantido: mant.count ?? 0,
      somaAntes: revisados.reduce((t, x) => t + Number(x.valor_original), 0),
      somaDepois: revisados.reduce((t, x) => t + Number(x.valor_final ?? x.valor_original), 0),
    };
    type Row = {
      deal_id: string;
      rd_deal_id: string | null;
      empresa: string | null;
      company_id: string | null;
      negocio: string | null;
      produto: string | null;
      fechado_em: string | null;
      valor_original: number;
      preco_tipico: number | null;
      sugestao: number | null;
      status: LinhaRevisao["status"];
      valor_final: number | null;
      revisado_por: string | null;
      revisado_em: string | null;
    };
    return {
      total: count ?? 0,
      porPagina: POR_PAGINA,
      resumo: tot,
      linhas: ((linhas ?? []) as Row[]).map(
        (x): LinhaRevisao => ({
          dealId: x.deal_id,
          rdDealId: x.rd_deal_id,
          empresa: x.empresa,
          companyId: x.company_id,
          negocio: x.negocio,
          produto: x.produto,
          fechadoEm: x.fechado_em,
          valorOriginal: Number(x.valor_original),
          precoTipico: x.preco_tipico == null ? null : Number(x.preco_tipico),
          sugestao: x.sugestao == null ? null : Number(x.sugestao),
          status: x.status,
          valorFinal: x.valor_final == null ? null : Number(x.valor_final),
          revisadoPor: x.revisado_por ? (nome.get(x.revisado_por) ?? "—") : null,
          revisadoEm: x.revisado_em,
        }),
      ),
    };
  });

/** Grava a decisão: corrige (ou mantém) o valor do negócio e registra quem decidiu. */
export const decidirRevisaoValor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        acao: z.enum(["dividir10", "dividir100", "manter", "valor", "desfazer"]),
        valor: z.number().min(0).max(100_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await podeRevisar(solto(context.supabase), context.userId)))
      throw new Error("Só a gestão e o administrativo revisam valores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = solto(supabaseAdmin);
    const { data: linha, error } = await db
      .from("revisao_valores")
      .select("valor_original")
      .eq("deal_id", data.dealId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!linha) throw new Error("Negócio fora da lista de revisão");
    const original = Number((linha as { valor_original: number }).valor_original);
    const novo =
      data.acao === "dividir10"
        ? Math.round((original / 10) * 100) / 100
        : data.acao === "dividir100"
          ? Math.round(original) / 100
          : data.acao === "valor"
            ? (data.valor ?? NaN)
            : original;
    if (!Number.isFinite(novo)) throw new Error("Informe o valor");
    const { data: deal } = await db
      .from("deals")
      .select("provenance")
      .eq("id", data.dealId)
      .maybeSingle();
    const prov = ((deal as { provenance?: Record<string, string> } | null)?.provenance ??
      {}) as Record<string, string>;
    const { error: e1 } = await db
      .from("deals")
      .update({
        amount: novo,
        updated_at: new Date().toISOString(),
        provenance: { ...prov, amount: data.acao === "desfazer" ? "rd" : "manual" },
      } as never)
      .eq("id", data.dealId);
    if (e1) throw new Error(e1.message);
    const desfazer = data.acao === "desfazer";
    const { error: e2 } = await db
      .from("revisao_valores")
      .update({
        status: desfazer ? "pendente" : data.acao === "manter" ? "mantido" : "corrigido",
        valor_final: desfazer ? null : novo,
        revisado_por: desfazer ? null : context.userId,
        revisado_em: desfazer ? null : new Date().toISOString(),
      } as never)
      .eq("deal_id", data.dealId);
    if (e2) throw new Error(e2.message);
    return { valor: novo };
  });
