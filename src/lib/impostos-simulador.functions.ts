import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REGIMES, type Classificacao, type Regime } from "@/lib/impostos/calculo";
import { regraDaLinha } from "@/lib/impostos.functions";

/*
 * Aba "Calculadora de impostos": simulador avulso (sem negócio), regras
 * editáveis (gestão e ADM) e histórico de simulações — o que a calculadora
 * de impostos à parte fazia, agora dentro do Compass e com as mesmas regras
 * usadas no negócio e na proposta.
 */
const solto = (s: unknown) => s as SupabaseClient;

async function podeEditar(db: SupabaseClient, userId: string) {
  const [{ data: gestor }, { data: adm }] = await Promise.all([
    db.rpc("is_manager", { _user_id: userId }),
    db.rpc("has_team", { _user_id: userId, _team: "administrativo" }),
  ]);
  return !!gestor || !!adm;
}

export const dadosDaCalculadora = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [regras, produtos, pode] = await Promise.all([
      db
        .from("impostos_regras" as never)
        .select("*")
        .order("ordem"),
      db
        .from("products")
        .select("id, nome, classificacao_fiscal, preco_tabela")
        .eq("ativo", true)
        .order("nome"),
      podeEditar(db, context.userId),
    ]);
    if (regras.error) throw new Error(regras.error.message);
    const linhas = (regras.data ?? []) as unknown as Parameters<typeof regraDaLinha>[0][];
    return {
      podeEditar: pode,
      regras: linhas.map((r) => ({ ...regraDaLinha(r), ordem: r.ordem })),
      produtos: (
        (produtos.data ?? []) as Array<{
          id: string;
          nome: string;
          classificacao_fiscal: Classificacao | null;
          preco_tabela: number | string | null;
        }>
      ).map((p) => ({
        id: p.id,
        nome: p.nome,
        classificacao: p.classificacao_fiscal,
        preco: p.preco_tabela == null ? null : Number(p.preco_tabela),
      })),
    };
  });

/** Empresas da base para preencher o cliente (regime, município, ISS). */
export const empresasParaImpostos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const q = data.q.replace(/[,()*%\\]/g, " ").trim();
    const digitos = q.replace(/\D/g, "");
    let query = db
      .from("companies")
      .select("id, nome, cnpj, cidade, estado, regime_tributario, iss_categoria_especial")
      .eq("ativo", true)
      .limit(15);
    query =
      digitos.length >= 5
        ? query.or(`nome.ilike.%${q}%,cnpj.ilike.%${digitos}%`)
        : query.ilike("nome", `%${q}%`);
    const { data: rows, error } = await query.order("nome");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      nome: string;
      cnpj: string | null;
      cidade: string | null;
      estado: string | null;
      regime_tributario: Regime | null;
      iss_categoria_especial: boolean | null;
    }>;
  });

const regraZ = z
  .object({
    id: z.string().uuid().nullable(),
    nome: z.string().trim().min(1).max(160),
    classificacao: z.enum(["licenciamento", "suporte", "treinamento"]).nullable(),
    produtoId: z.string().uuid().nullable(),
    tipoPessoa: z.enum(["CPF", "CNPJ"]).nullable(),
    regime: z.enum(REGIMES as [Regime, ...Regime[]]).nullable(),
    excetoRegimes: z.array(z.enum(REGIMES as [Regime, ...Regime[]])).max(5),
    municipio: z.string().trim().max(120).nullable(),
    categoriaEspecialIss: z.boolean(),
    valorMin: z.number().min(0).nullable(),
    valorMax: z.number().min(0).nullable(),
    prioridade: z.number().int().min(0).max(1000),
    itens: z
      .array(
        z.object({
          imposto: z.string().trim().min(1).max(20),
          aliquota: z.number().min(0).max(100),
        }),
      )
      .max(10),
    observacoes: z.string().trim().max(1000).nullable(),
    ativo: z.boolean(),
    ordem: z.number().int().min(0).max(100000).optional(),
  })
  .refine((r) => r.valorMin == null || r.valorMax == null || r.valorMin <= r.valorMax, {
    message: "O valor mínimo da faixa é maior que o máximo",
  });

export const salvarRegraImposto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => regraZ.parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeEditar(db, context.userId)))
      throw new Error("Só a gestão e o administrativo mudam as regras de impostos");
    const linha = {
      nome: data.nome,
      classificacao: data.produtoId ? null : data.classificacao,
      product_id: data.produtoId,
      tipo_pessoa: data.tipoPessoa,
      regime: data.regime,
      exceto_regimes: data.excetoRegimes,
      municipio: data.municipio || null,
      categoria_especial_iss: data.categoriaEspecialIss,
      valor_min: data.valorMin,
      valor_max: data.valorMax,
      prioridade: data.prioridade,
      itens: data.itens,
      observacoes: data.observacoes || null,
      ativo: data.ativo,
      atualizado_por: context.userId,
      atualizado_em: new Date().toISOString(),
      ...(data.ordem != null ? { ordem: data.ordem } : {}),
    };
    if (data.id) {
      const { error } = await db
        .from("impostos_regras" as never)
        .update(linha as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ultima } = await db
      .from("impostos_regras" as never)
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1);
    const ordem = (((ultima ?? []) as Array<{ ordem: number }>)[0]?.ordem ?? 0) + 10;
    const { data: nova, error } = await db
      .from("impostos_regras" as never)
      .insert({ ...linha, ordem } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (nova as { id: string }).id };
  });

export const excluirRegraImposto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeEditar(db, context.userId)))
      throw new Error("Só a gestão e o administrativo mudam as regras de impostos");
    const { error } = await db
      .from("impostos_regras" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const salvarSimulacaoImpostos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        titulo: z.string().trim().max(160).nullable(),
        companyId: z.string().uuid().nullable(),
        entrada: z.record(z.string(), z.unknown()),
        resultado: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: nova, error } = await db
      .from("impostos_simulacoes" as never)
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        titulo: data.titulo,
        entrada: data.entrada,
        resultado: data.resultado,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (nova as { id: string }).id };
  });

export const historicoImpostos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data, error }, { data: perfis }] = await Promise.all([
      db
        .from("impostos_simulacoes" as never)
        .select("id, user_id, titulo, entrada, resultado, criado_em")
        .order("criado_em", { ascending: false })
        .limit(60),
      db.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || "—"],
      ),
    );
    type Linha = {
      id: string;
      user_id: string;
      titulo: string | null;
      entrada: unknown;
      resultado: { bruto?: number; impostos?: number; liquidoFinal?: number } | null;
      criado_em: string;
    };
    return ((data ?? []) as unknown as Linha[]).map((s) => ({
      id: s.id,
      titulo: s.titulo,
      criadoEm: s.criado_em,
      autor: nome.get(s.user_id) ?? "—",
      meu: s.user_id === context.userId,
      entradaJson: JSON.stringify(s.entrada ?? {}),
      bruto: Number(s.resultado?.bruto ?? 0),
      impostos: Number(s.resultado?.impostos ?? 0),
      liquido: Number(s.resultado?.liquidoFinal ?? 0),
    }));
  });

export const apagarSimulacaoImpostos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await solto(context.supabase)
      .from("impostos_simulacoes" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
