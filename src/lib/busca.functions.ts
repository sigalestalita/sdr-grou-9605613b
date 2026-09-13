import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Busca global da barra do topo.
 *
 * Antes a paleta baixava o kanban inteiro e filtrava no navegador, o que além
 * de pesado (são dezenas de milhares de leads) só olhava para leads — e ainda
 * por cima em campos que não existem: filtrava por "company" e "job_title",
 * quando as colunas são company_name e position. Buscar empresa pelo nome
 * nunca funcionou.
 *
 * Agora a consulta vai ao banco, por ilike, e cobre as três visões da mesma
 * empresa: o lead do SDR, a empresa do comercial e o cliente do CS.
 */

export type ResultadoBusca = {
  tipo: "lead" | "empresa" | "cliente";
  id: string;
  titulo: string;
  subtitulo: string | null;
  to: string;
};

/** Escapa o que o PostgREST trata como curinga ou separador. */
function termoSeguro(q: string): string {
  return q.replace(/[%_,()]/g, " ").trim();
}

export const buscaGlobal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const termo = termoSeguro(data.q);
    if (termo.length < 2) return { resultados: [] as ResultadoBusca[] };
    const alvo = `%${termo}%`;

    const [leads, empresas, clientes] = await Promise.all([
      supabase
        .from("leads")
        .select("id, name, company_name, email, position")
        .or(`name.ilike.${alvo},company_name.ilike.${alvo},email.ilike.${alvo}`)
        .limit(6),
      supabase
        .from("companies")
        .select("id, uid, nome, segmento, cnpj")
        .ilike("nome", alvo)
        .limit(6),
      supabase
        .from("cs_clients")
        .select("client_uid, nome_empresa, current_signal")
        .ilike("nome_empresa", alvo)
        .eq("ativo", true)
        .limit(6),
    ]);

    const resultados: ResultadoBusca[] = [];

    for (const l of leads.data ?? []) {
      resultados.push({
        tipo: "lead",
        id: l.id as string,
        titulo: (l.name as string) || "Lead sem nome",
        subtitulo:
          [l.company_name, l.position].filter(Boolean).join(" · ") || (l.email as string) || null,
        to: `/lead/${l.id}`,
      });
    }

    for (const e of empresas.data ?? []) {
      resultados.push({
        tipo: "empresa",
        id: e.id as string,
        titulo: (e.nome as string) || "Empresa sem nome",
        subtitulo: (e.segmento as string) || (e.cnpj as string) || null,
        // a jornada é a visão que junta os módulos para aquela empresa
        to: `/jornada?empresa=${e.id}`,
      });
    }

    for (const c of clientes.data ?? []) {
      resultados.push({
        tipo: "cliente",
        id: c.client_uid as string,
        titulo: (c.nome_empresa as string) || "Cliente sem nome",
        subtitulo: `Customer Success · sinaleira ${c.current_signal}`,
        to: `/empresas/${c.client_uid}`,
      });
    }

    return { resultados };
  });
