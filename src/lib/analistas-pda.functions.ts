import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_ANALISTAS_POR_IMPORTACAO } from "@/lib/cs/analistas-pda";

/*
 * Analistas PDA: importação (Configurações do CS), lista para ligar os "sem
 * empresa" e a aba da ficha da empresa. A importação e o vínculo são da
 * gestão (o banco confere); a leitura é de todos.
 */
const solto = (s: unknown) => s as SupabaseClient;

const LinhaZ = z.object({
  nome: z.string().trim().min(1).max(200),
  email: z.string().trim().max(254).nullable(),
  telefone: z.string().max(40).nullable(),
  cargo: z.string().max(120).nullable(),
  empresa: z.string().max(200).nullable(),
  cnpj: z.string().max(14).nullable(),
  certificado_em: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  dados: z.record(z.string(), z.string().max(500)).default({}),
});

export const importarAnalistasPda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ linhas: z.array(LinhaZ).min(1).max(MAX_ANALISTAS_POR_IMPORTACAO) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const importacao = new Date().toISOString();
    const total = {
      novos: 0,
      atualizados: 0,
      sem_empresa: 0,
      por_vinculo: {} as Record<string, number>,
    };
    for (let i = 0; i < data.linhas.length; i += 500) {
      const { data: r, error } = await db.rpc("importar_analistas_pda", {
        _linhas: data.linhas.slice(i, i + 500),
        _importacao: importacao,
      });
      if (error) throw new Error(error.message);
      const p = r as typeof total;
      total.novos += p.novos ?? 0;
      total.atualizados += p.atualizados ?? 0;
      total.sem_empresa += p.sem_empresa ?? 0;
      for (const [k, v] of Object.entries(p.por_vinculo ?? {}))
        total.por_vinculo[k] = (total.por_vinculo[k] ?? 0) + Number(v);
    }
    return total;
  });

type Linha = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  empresa_informada: string | null;
  cnpj: string | null;
  company_id: string | null;
  vinculo: string | null;
  certificado_em: string | null;
  dados: Record<string, string> | null;
  companies: { nome: string } | null;
};
const COLS =
  "id, nome, email, telefone, cargo, empresa_informada, cnpj, company_id, vinculo, certificado_em, dados, companies:company_id(nome)";

const paraAnalista = (r: Linha) => ({
  id: r.id,
  nome: r.nome,
  email: r.email,
  telefone: r.telefone,
  cargo: r.cargo,
  empresaInformada: r.empresa_informada,
  cnpj: r.cnpj,
  companyId: r.company_id,
  empresaNome: r.companies?.nome ?? null,
  vinculo: r.vinculo,
  certificadoEm: r.certificado_em,
  dados: r.dados ?? {},
});
export type AnalistaPda = ReturnType<typeof paraAnalista>;

/** Lista para as Configurações: todos ou só os sem empresa, com busca. */
export const listarAnalistasPda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        semEmpresa: z.boolean().default(false),
        q: z.string().trim().max(80).default(""),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let q = db.from("analistas_pda").select(COLS).order("nome").limit(300);
    if (data.semEmpresa) q = q.is("company_id", null);
    const termo = data.q.replace(/[%,()]/g, " ").trim();
    if (termo)
      q = q.or(`nome.ilike.%${termo}%,email.ilike.%${termo}%,empresa_informada.ilike.%${termo}%`);
    const [{ data: rows, error }, total, semEmpresa] = await Promise.all([
      q,
      db.from("analistas_pda").select("id", { count: "exact", head: true }),
      db.from("analistas_pda").select("id", { count: "exact", head: true }).is("company_id", null),
    ]);
    if (error) throw new Error(error.message);
    return {
      analistas: ((rows ?? []) as unknown as Linha[]).map(paraAnalista),
      total: total.count ?? 0,
      semEmpresa: semEmpresa.count ?? 0,
    };
  });

/** Liga (ou desliga) o analista a uma empresa à mão. */
export const vincularAnalistaPda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), companyId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await solto(context.supabase)
      .from("analistas_pda")
      .update({
        company_id: data.companyId,
        vinculo: data.companyId ? "manual" : null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerAnalistaPda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await solto(context.supabase)
      .from("analistas_pda")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Analistas da empresa (aba da ficha): os importados ligados à empresa e os
 * contatos do cliente marcados como analista (sem repetir pelo e-mail).
 */
export const analistasDaEmpresa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: cliente } = await db
      .from("cs_clients")
      .select("company_id")
      .eq("client_uid", data.clientUid)
      .maybeSingle();
    const companyId = (cliente as { company_id: string | null } | null)?.company_id ?? null;
    const [{ data: importados }, { data: contatos }] = await Promise.all([
      companyId
        ? db.from("analistas_pda").select(COLS).eq("company_id", companyId).order("nome")
        : Promise.resolve({ data: [] }),
      db
        .from("cs_contacts")
        .select("id, nome, email, whatsapp, cargo, analista_certificado_em")
        .eq("client_uid", data.clientUid)
        .eq("analista_pda", true)
        .order("nome"),
    ]);
    const lista: Array<AnalistaPda & { origem: "importacao" | "contato" }> = (
      (importados ?? []) as unknown as Linha[]
    ).map((r) => ({ ...paraAnalista(r), origem: "importacao" }));
    const emails = new Set(lista.map((a) => a.email?.toLowerCase()).filter(Boolean));
    for (const c of (contatos ?? []) as Array<{
      id: string;
      nome: string;
      email: string | null;
      whatsapp: string | null;
      cargo: string | null;
      analista_certificado_em: string | null;
    }>) {
      if (c.email && emails.has(c.email.toLowerCase())) continue;
      lista.push({
        id: c.id,
        nome: c.nome,
        email: c.email,
        telefone: c.whatsapp,
        cargo: c.cargo,
        empresaInformada: null,
        cnpj: null,
        companyId,
        empresaNome: null,
        vinculo: "contato",
        certificadoEm: c.analista_certificado_em,
        dados: {},
        origem: "contato",
      });
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome));
  });
