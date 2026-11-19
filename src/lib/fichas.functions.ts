import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Fichas cadastrais recebidas do app de cadastro (ver fichas/fichas.server.ts). */
const solto = (s: unknown) => s as SupabaseClient;

export type Ficha = {
  id: string;
  origem: string;
  tipo: "CNPJ" | "CPF";
  documento: string | null;
  nome: string;
  nomeFantasia: string | null;
  email: string | null;
  vendedor: string | null;
  cidade: string | null;
  estado: string | null;
  dados: Record<string, string>;
  enviadaEm: string;
  empresa: { id: string; uid: string; nome: string } | null;
  confirmadaEm: string | null;
  confirmadaPor: string | null;
};

const COLS =
  "id, origem, tipo, documento, nome, nome_fantasia, email, vendedor_nome, cidade, estado, dados, enviada_em, confirmada_em, confirmada_por, companies:company_id(id, uid, nome)";

function mapear(r: Record<string, unknown>): Ficha {
  return {
    id: r.id as string,
    origem: String(r.origem),
    tipo: r.tipo as "CNPJ" | "CPF",
    documento: (r.documento as string | null) ?? null,
    nome: String(r.nome),
    nomeFantasia: (r.nome_fantasia as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    vendedor: (r.vendedor_nome as string | null) ?? null,
    cidade: (r.cidade as string | null) ?? null,
    estado: (r.estado as string | null) ?? null,
    dados: (r.dados as Record<string, string>) ?? {},
    enviadaEm: String(r.enviada_em),
    empresa: (r.companies as Ficha["empresa"]) ?? null,
    confirmadaEm: (r.confirmada_em as string | null) ?? null,
    confirmadaPor: (r.confirmada_por as string | null) ?? null,
  };
}

export const fichasDaEmpresa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: rows, error } = await db
      .from("fichas_cadastrais")
      .select(COLS)
      .eq("company_id", data.companyId)
      .order("enviada_em", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map(mapear);
  });

export const listarFichas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ busca: z.string().trim().max(100).default(""), soltas: z.boolean().default(false) })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Antes de listar, liga as soltas a empresas que passaram a existir.
    const { religarFichasSoltas } = await import("@/lib/fichas/fichas.server");
    await religarFichasSoltas().catch(() => 0);
    const db = solto(context.supabase);
    let q = db
      .from("fichas_cadastrais")
      .select(COLS)
      .order("enviada_em", { ascending: false })
      .limit(500);
    if (data.soltas) q = q.is("company_id", null);
    if (data.busca) {
      const b = data.busca.replace(/[%,()]/g, " ");
      const dig = b.replace(/\D/g, "");
      q = q.or(
        [
          `nome.ilike.%${b}%`,
          `nome_fantasia.ilike.%${b}%`,
          `email.ilike.%${b}%`,
          dig.length >= 4 ? `documento.ilike.%${dig}%` : null,
        ]
          .filter(Boolean)
          .join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const { count: total } = await db
      .from("fichas_cadastrais")
      .select("id", { count: "exact", head: true });
    const { count: soltas } = await db
      .from("fichas_cadastrais")
      .select("id", { count: "exact", head: true })
      .is("company_id", null);
    return {
      total: total ?? 0,
      soltas: soltas ?? 0,
      fichas: ((rows ?? []) as Array<Record<string, unknown>>).map(mapear),
    };
  });

export const importarFichasCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ csv: z.string().min(10).max(5_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: pode } = await solto(context.supabase).rpc("pode_propor", {
      _user_id: context.userId,
    });
    if (!pode) throw new Error("Sem permissão");
    const { importarCsvDeFichas } = await import("@/lib/fichas/fichas.server");
    return importarCsvDeFichas(data.csv);
  });

/** Uma ficha (link do e-mail para o executivo confirmar). */
export const getFicha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: r, error } = await db
      .from("fichas_cadastrais")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) return null;
    const ficha = mapear(r as Record<string, unknown>);
    let confirmadaPorNome: string | null = null;
    if (ficha.confirmadaPor) {
      const { data: p } = await db
        .from("profiles")
        .select("full_name")
        .eq("id", ficha.confirmadaPor)
        .maybeSingle();
      confirmadaPorNome = (p as { full_name: string | null } | null)?.full_name ?? null;
    }
    const { sugestoesDeEmpresa } = await import("@/lib/fichas/fichas.server");
    const sugestoes = ficha.empresa ? [] : await sugestoesDeEmpresa(ficha.nome, ficha.nomeFantasia);
    return { ficha, confirmadaPorNome, sugestoes };
  });

/** Busca de empresa para vincular a ficha. */
export const buscarEmpresaParaFicha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const b = data.q.replace(/[%,()]/g, " ");
    const dig = b.replace(/\D/g, "");
    const { data: rows } = await db
      .from("companies")
      .select("id, uid, nome, cnpj")
      .or(
        [`nome.ilike.%${b}%`, dig.length >= 4 ? `cnpj.ilike.%${dig}%` : null]
          .filter(Boolean)
          .join(","),
      )
      .limit(8);
    return (rows ?? []) as Array<{ id: string; uid: string; nome: string; cnpj: string | null }>;
  });

/**
 * O executivo confirma os dados da ficha e a empresa dela. Ao confirmar o
 * vínculo, a ficha completa o cadastro e a política de faturamento da
 * empresa (só o que estiver vazio). Se a empresa não tem CNPJ, recebe o da
 * ficha.
 */
export const confirmarFicha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), companyId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: f, error: e1 } = await db
      .from("fichas_cadastrais")
      .select("id, tipo, documento, dados, enviada_em")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!f) throw new Error("Ficha não encontrada");
    const fi = f as {
      tipo: string;
      documento: string | null;
      dados: Record<string, string>;
      enviada_em: string;
    };
    const { error } = await db
      .from("fichas_cadastrais")
      .update({
        company_id: data.companyId,
        confirmada_em: data.companyId ? new Date().toISOString() : null,
        confirmada_por: data.companyId ? context.userId : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.companyId) {
      const { aplicarFichaNaEmpresa } = await import("@/lib/fichas/fichas.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (fi.tipo === "CNPJ" && fi.documento?.length === 14) {
        await (supabaseAdmin as unknown as SupabaseClient)
          .from("companies")
          .update({ cnpj: fi.documento })
          .eq("id", data.companyId)
          .is("cnpj", null);
      }
      await aplicarFichaNaEmpresa(data.companyId, fi.dados ?? {}, fi.enviada_em);
    }
    return { ok: true };
  });
