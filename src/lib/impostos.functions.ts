import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { totalItem } from "@/lib/catalogo/itens";
import {
  calcular,
  REGIMES,
  regimeDaReceita,
  tipoPessoaDoDocumento,
  type Classificacao,
  type Cliente,
  type Regime,
} from "@/lib/impostos/calculo";

/*
 * Calculadora de impostos retidos dentro do negócio: os itens já dizem a
 * classificação fiscal (pelo catálogo), a empresa diz regime e município;
 * o resultado vira o campo "Impostos retidos" da proposta.
 */
const solto = (s: unknown) => s as SupabaseClient;

type ItemRow = {
  nome: string;
  quantidade: number;
  valor_unitario: number;
  desconto_tipo: "pct" | "valor";
  desconto: number;
  products: { classificacao_fiscal: Classificacao | null } | null;
};

async function itensDoNegocio(db: SupabaseClient, dealId: string) {
  const { data, error } = await db
    .from("deal_products")
    .select(
      "nome, quantidade, valor_unitario, desconto_tipo, desconto, products:product_id(classificacao_fiscal)",
    )
    .eq("deal_id", dealId)
    .order("ordem");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ItemRow[]).map((i) => ({
    nome: i.nome,
    classificacao: i.products?.classificacao_fiscal ?? null,
    bruto: totalItem({
      quantidade: Number(i.quantidade),
      valor_unitario: Number(i.valor_unitario),
      desconto_tipo: i.desconto_tipo,
      desconto: Number(i.desconto),
    }),
  }));
}

export const dadosImpostos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: deal, error } = await db
      .from("deals")
      .select(
        "id, company_id, cnpj_faturamento, impostos_calculo, companies:company_id(id, nome, cnpj, cidade, estado, regime_tributario, iss_categoria_especial)",
      )
      .eq("id", data.dealId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deal) throw new Error("Negócio não encontrado");
    const d = deal as Record<string, unknown>;
    const emp = d.companies as {
      id: string;
      nome: string;
      cnpj: string | null;
      cidade: string | null;
      estado: string | null;
      regime_tributario: Regime | null;
      iss_categoria_especial: boolean | null;
    } | null;
    const documento = (d.cnpj_faturamento as string | null) || emp?.cnpj || "";
    return {
      empresa: emp,
      documento,
      tipoPessoa: tipoPessoaDoDocumento(documento) ?? "CNPJ",
      itens: await itensDoNegocio(db, data.dealId),
      ultimoCliente:
        (
          d.impostos_calculo as {
            cliente?: {
              documento: string;
              tipoPessoa: "CPF" | "CNPJ";
              regime: Regime | null;
              municipio: string | null;
              categoriaEspecialIss: boolean;
            };
          } | null
        )?.cliente ?? null,
    };
  });

/** Razão social, município, UF e regime pela Receita (BrasilAPI, pública). */
export const consultarCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cnpj: z.string().max(30) }).parse(d))
  .handler(async ({ data }) => {
    const cnpj = data.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) throw new Error("Informe um CNPJ com 14 dígitos");
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok)
      throw new Error(
        res.status === 404
          ? "CNPJ não encontrado na Receita"
          : "Não foi possível consultar o CNPJ agora",
      );
    const r = (await res.json()) as {
      razao_social?: string;
      nome_fantasia?: string;
      municipio?: string;
      uf?: string;
      cnae_fiscal_descricao?: string;
      opcao_pelo_simples?: boolean | null;
      opcao_pelo_mei?: boolean | null;
      descricao_situacao_cadastral?: string;
    };
    const capital = (s?: string) =>
      (s ?? "")
        .toLowerCase()
        .replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    return {
      cnpj,
      razaoSocial: r.razao_social ?? r.nome_fantasia ?? "",
      municipio: capital(r.municipio),
      uf: r.uf ?? "",
      cnae: r.cnae_fiscal_descricao ?? "",
      situacao: r.descricao_situacao_cadastral ?? "",
      regime: regimeDaReceita(r),
    };
  });

const clienteZ = z.object({
  documento: z.string().max(30),
  tipoPessoa: z.enum(["CPF", "CNPJ"]),
  regime: z.enum(REGIMES as [Regime, ...Regime[]]).nullable(),
  municipio: z.string().trim().max(120).nullable(),
  categoriaEspecialIss: z.boolean(),
});

/**
 * Recalcula no servidor (com os itens salvos), grava os impostos e o valor
 * final no negócio e guarda regime/ISS na empresa para a próxima vez.
 */
export const aplicarImpostos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid(), cliente: clienteZ }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const itens = await itensDoNegocio(db, data.dealId);
    if (itens.length === 0) throw new Error("O negócio não tem itens");
    const c: Cliente = {
      tipoPessoa: data.cliente.tipoPessoa,
      regime: data.cliente.regime,
      municipio: data.cliente.municipio,
      categoriaEspecialIss: data.cliente.categoriaEspecialIss,
    };
    const r = calcular(itens, c);
    const agora = new Date().toISOString();
    const { data: deal, error } = await db
      .from("deals")
      .update({
        valor_impostos: r.impostos,
        valor_liquido: r.liquido,
        impostos_calculo: { em: agora, por: context.userId, cliente: data.cliente, resultado: r },
        updated_at: agora,
      })
      .eq("id", data.dealId)
      .select("company_id")
      .single();
    if (error) throw new Error(error.message);
    // Guarda na empresa o que foi respondido (se a pessoa puder editar a empresa).
    const companyId = (deal as { company_id: string | null }).company_id;
    let empresaAtualizada = false;
    if (companyId) {
      const patch: Record<string, unknown> = { iss_categoria_especial: c.categoriaEspecialIss };
      if (c.regime) patch.regime_tributario = c.regime;
      const { data: up } = await db
        .from("companies")
        .update(patch)
        .eq("id", companyId)
        .select("id");
      empresaAtualizada = (up ?? []).length > 0;
    }
    return { ...r, empresaAtualizada };
  });
