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
};

const COLS =
  "id, origem, tipo, documento, nome, nome_fantasia, email, vendedor_nome, cidade, estado, dados, enviada_em, companies:company_id(id, uid, nome)";

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
