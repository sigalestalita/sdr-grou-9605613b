import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Uma ficha por empresa, para todos os times.
 *
 * /empresas/$uid aceita o código da ficha do CS (ex.: SJCR) ou o id da empresa
 * na base. abrirFichaDaEmpresa diz qual ficha abrir: a ficha do cliente quando
 * existe (seguindo mescladas), ou a empresa da base quando ainda não é cliente.
 * tudoDaEmpresa junta o que os outros times têm dela: negócios, propostas,
 * leads do SDR, faturas e requerimentos.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const abrirFichaDaEmpresa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chave: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient;
    type Ficha = {
      client_uid: string;
      ativo: boolean | null;
      mesclado_em: string | null;
      company_id: string | null;
    };

    if (!UUID.test(data.chave)) {
      // Código de ficha: segue as mescladas até a ficha que ficou.
      let uid = data.chave;
      for (let i = 0; i < 5; i++) {
        const { data: f } = await sb
          .from("cs_clients")
          .select("client_uid, ativo, mesclado_em, company_id")
          .eq("client_uid", uid)
          .maybeSingle();
        const ficha = f as Ficha | null;
        if (!ficha) return { tipo: "nada" as const };
        if (!ficha.mesclado_em) return { tipo: "cliente" as const, clientUid: ficha.client_uid };
        uid = ficha.mesclado_em;
      }
      return { tipo: "cliente" as const, clientUid: uid };
    }

    // Id da empresa: a ficha ativa dela (a de contrato mais recente) ou, sem
    // ficha, a própria empresa.
    const { data: fichas } = await sb
      .from("cs_clients")
      .select("client_uid, ativo, mesclado_em, company_id")
      .eq("company_id", data.chave)
      .is("mesclado_em", null)
      .order("ativo", { ascending: false })
      .order("data_renovacao", { ascending: false, nullsFirst: false })
      .limit(1);
    const f = ((fichas ?? []) as Ficha[])[0];
    if (f) return { tipo: "cliente" as const, clientUid: f.client_uid };
    const { data: emp } = await sb
      .from("companies")
      .select("id")
      .eq("id", data.chave)
      .maybeSingle();
    return emp ? { tipo: "empresa" as const, companyId: data.chave } : { tipo: "nada" as const };
  });

export type TudoDaEmpresa = Awaited<ReturnType<typeof tudoDaEmpresaHandler>>;

async function tudoDaEmpresaHandler(
  sb: import("@supabase/supabase-js").SupabaseClient,
  companyId: string,
) {
  const [empresa, deals, propostas, leads, faturas, reqs, stages, profiles, contatos] =
    await Promise.all([
      sb
        .from("companies")
        .select(
          "id, nome, cnpj, segmento, porte, cidade, estado, site_url, linkedin_url, telefone, lifecycle, owner_user_id, sdr_user_id",
        )
        .eq("id", companyId)
        .maybeSingle(),
      sb
        .from("deals")
        .select(
          "id, nome, status, amount, stage_id, executivo_user_id, owner_user_id, closed_at, created_at, congelado_ate",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50),
      sb
        .from("propostas")
        .select("id, numero, deal_id, status, valor_final, enviada_em, aceita_em, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      sb
        .from("leads")
        .select("id, name, position, stage_id, assigned_to, meeting_at, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30),
      sb
        .from("faturas")
        .select("id, numero_nf, emitida_em, valor_liquido, status")
        .eq("company_id", companyId)
        .order("emitida_em", { ascending: false, nullsFirst: false })
        .limit(20),
      sb
        .from("requerimentos")
        .select("id, numero, status, servico, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb.from("pipeline_stages").select("id, nome, kind"),
      sb.from("profiles").select("id, full_name, email"),
      sb
        .from("contacts")
        .select("id, nome, email, telefone, cargo")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("nome")
        .limit(200),
    ]);

  const etapa = new Map(
    ((stages.data ?? []) as Array<{ id: string; nome: string }>).map((s) => [s.id, s.nome]),
  );
  const nome = new Map(
    (
      (profiles.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
    ).map((p) => [p.id, p.full_name || p.email || "—"]),
  );
  type Deal = {
    id: string;
    nome: string | null;
    status: string;
    amount: number | null;
    stage_id: string | null;
    executivo_user_id: string | null;
    owner_user_id: string | null;
    closed_at: string | null;
    created_at: string;
    congelado_ate: string | null;
  };
  type Lead = {
    id: string;
    name: string | null;
    position: string | null;
    stage_id: string | null;
    assigned_to: string | null;
    meeting_at: string | null;
    created_at: string;
  };
  const e = empresa.data as {
    id: string;
    nome: string;
    cnpj: string | null;
    segmento: string | null;
    porte: string | null;
    cidade: string | null;
    estado: string | null;
    site_url: string | null;
    linkedin_url: string | null;
    telefone: string | null;
    lifecycle: string | null;
    owner_user_id: string | null;
    sdr_user_id: string | null;
  } | null;

  return {
    empresa: e
      ? {
          ...e,
          dono: e.owner_user_id ? (nome.get(e.owner_user_id) ?? null) : null,
          sdr: e.sdr_user_id ? (nome.get(e.sdr_user_id) ?? null) : null,
        }
      : null,
    negocios: ((deals.data ?? []) as Deal[]).map((d) => ({
      id: d.id,
      nome: d.nome,
      status: d.status,
      valor: d.amount,
      etapa: d.stage_id ? (etapa.get(d.stage_id) ?? null) : null,
      responsavel: (() => {
        const r = d.executivo_user_id ?? d.owner_user_id;
        return r ? (nome.get(r) ?? null) : null;
      })(),
      fechadoEm: d.closed_at,
      criadoEm: d.created_at,
      congelado: !!d.congelado_ate,
    })),
    propostas: (propostas.data ?? []) as Array<{
      id: string;
      numero: string | number | null;
      deal_id: string | null;
      status: string;
      valor_final: number | null;
      enviada_em: string | null;
      aceita_em: string | null;
      created_at: string;
    }>,
    leads: ((leads.data ?? []) as Lead[]).map((l) => ({
      id: l.id,
      nome: l.name,
      cargo: l.position,
      etapa: l.stage_id ? (etapa.get(l.stage_id) ?? null) : null,
      sdr: l.assigned_to ? (nome.get(l.assigned_to) ?? null) : null,
      reuniao: l.meeting_at,
      criadoEm: l.created_at,
    })),
    faturas: (faturas.data ?? []) as Array<{
      id: string;
      numero_nf: string | null;
      emitida_em: string | null;
      valor_liquido: number | null;
      status: string;
    }>,
    requerimentos: (reqs.data ?? []) as Array<{
      id: string;
      numero: string | number | null;
      status: string;
      servico: string | null;
      created_at: string;
    }>,
    contatos: (contatos.data ?? []) as Array<{
      id: string;
      nome: string | null;
      email: string | null;
      telefone: string | null;
      cargo: string | null;
    }>,
  };
}

export const tudoDaEmpresa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    tudoDaEmpresaHandler(
      context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
      data.companyId,
    ),
  );

export type EmpresaDaBase = {
  id: string;
  nome: string;
  cnpj: string | null;
  segmento: string | null;
  cidade: string | null;
  estado: string | null;
  owner_user_id: string | null;
  sdr_user_id: string | null;
  negocios_abertos: number;
  negocios_ganhos: number;
  ultimo_negocio: string | null;
  contatos: number;
};

/** Empresas da base que ainda não têm ficha do CS (as que têm vêm pela ficha). */
export const listEmpresasDaBase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchAllRows } = await import("@/lib/cs/cs-core.server");
    const sb = context.supabase as unknown as {
      rpc(fn: string): {
        range(
          a: number,
          b: number,
        ): PromiseLike<{ data: EmpresaDaBase[] | null; error: { message: string } | null }>;
      };
    };
    return fetchAllRows<EmpresaDaBase>((from, to) => sb.rpc("empresas_da_base").range(from, to));
  });
