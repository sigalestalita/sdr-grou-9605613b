import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";

/* Conta Azul: conexão, leitura manual e ligação venda ↔ negócio. */
const solto = (s: unknown) => s as SupabaseClient;

async function exigeAdm(db: SupabaseClient, userId: string) {
  if (!(await podeFaturar(db, userId)))
    throw new Error("Só o Administrativo e a gestão mexem na Conta Azul");
}

export const getContaAzulStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { statusContaAzul } = await import("@/lib/contaazul/sync.server");
    return statusContaAzul();
  });

/** Link do login da Conta Azul (quem autoriza precisa ser admin da conta e usar 2FA). */
export const getContaAzulAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    const { credenciais, redirectUri, CA_AUTHORIZE, CA_SCOPE } =
      await import("@/lib/contaazul/api.server");
    const { id } = credenciais();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = crypto.randomUUID().replace(/-/g, "");
    await (supabaseAdmin as unknown as SupabaseClient).from("app_settings").upsert(
      {
        key: "contaazul_oauth_state",
        value: {
          state,
          origin: data.origin,
          user_id: context.userId,
          expira: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
      },
      { onConflict: "key" },
    );
    const url =
      `${CA_AUTHORIZE}?response_type=code&client_id=${encodeURIComponent(id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri(data.origin))}` +
      `&state=${state}&scope=${CA_SCOPE}`;
    return { url };
  });

export const desconectarContaAzul = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigeAdm(solto(context.supabase), context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as unknown as SupabaseClient)
      .from("contaazul_tokens")
      .delete()
      .eq("id", true);
    return { ok: true };
  });

export const sincronizarContaAzulAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigeAdm(solto(context.supabase), context.userId);
    const { sincronizarContaAzul } = await import("@/lib/contaazul/sync.server");
    return sincronizarContaAzul();
  });

export type NegocioCA = {
  id: string;
  amount: number | null;
  ca_venda_id: string | null;
  ca_venda_numero: number | null;
  ca_situacao: string | null;
  ca_nf_status: string | null;
  ca_nf_numeros: string | null;
  ca_valor_faturado: number | null;
  ca_sincronizado_em: string | null;
  faturado_em: string | null;
};
export type NotaDoNegocio = {
  numero_nfse: string | null;
  status: string | null;
  valor: number | null;
  data_competencia: string | null;
  motivo_cancelamento: string | null;
};

/** Faturamento do negócio vindo da Conta Azul (o executivo dono também vê). */
export const getContaAzulDoNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: d, error } = await db
      .from("deals")
      .select(
        "id, amount, ca_venda_id, ca_venda_numero, ca_situacao, ca_nf_status, ca_nf_numeros, ca_valor_faturado, ca_sincronizado_em, faturado_em",
      )
      .eq("id", data.dealId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const adm = await podeFaturar(db, context.userId);
    // Notas da venda: só o ADM lê as cópias (RLS); o executivo vê o resumo do negócio.
    let notas: NotaDoNegocio[] = [];
    const neg = d as NegocioCA | null;
    if (adm && neg?.ca_venda_id) {
      const { data: ns } = await db
        .from("ca_notas")
        .select("numero_nfse, status, valor, data_competencia, motivo_cancelamento")
        .eq("id_venda", neg.ca_venda_id)
        .order("data_competencia");
      notas = (ns ?? []) as NotaDoNegocio[];
    }
    return { negocio: neg, notas, podeLigar: adm };
  });

/** ADM informa (ou corrige) o número da venda na Conta Azul. null desliga. */
export const ligarVendaContaAzul = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ dealId: z.string().uuid(), numero: z.number().int().positive().nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigeAdm(db, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const { error } = await admin
      .from("deals")
      .update({
        ca_venda_numero: data.numero,
        ca_venda_id: null,
        ca_situacao: null,
        ca_nf_status: null,
        ca_nf_numeros: null,
        ca_valor_faturado: null,
      })
      .eq("id", data.dealId);
    if (error) throw new Error(error.message);
    if (data.numero) {
      const { atualizarNegocios } = await import("@/lib/contaazul/sync.server");
      await atualizarNegocios();
      const { data: v } = await admin
        .from("deals")
        .select("ca_venda_id")
        .eq("id", data.dealId)
        .maybeSingle();
      if (!(v as { ca_venda_id: string | null } | null)?.ca_venda_id)
        return {
          ok: true,
          aviso: "Venda ainda não lida da Conta Azul. Ela será ligada na próxima leitura.",
        };
    }
    return { ok: true, aviso: null };
  });

export type CadastroContaAzul = {
  clienteId: string;
  nome: string | null;
  documento: string | null;
  observacoes: string | null;
  email: string | null;
  telefone: string | null;
  emailsCobranca: string[];
  outrosContatos: Array<{
    nome: string | null;
    cargo: string | null;
    email: string | null;
    telefone: string | null;
  }>;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  endereco: string | null;
  ativo: boolean | null;
  atualizadoEm: string | null;
};

/**
 * Cadastro do cliente na Conta Azul (observações gerais, contatos, e-mails
 * de cobrança). Vê quem fatura (ADM/gestão) e o executivo que tem negócio
 * com a empresa. Para os demais volta vazio.
 */
export const getCadastroContaAzul = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ companyId: z.string().uuid().optional(), uid: z.string().max(40).optional() })
      .refine((v) => v.companyId || v.uid, "Informe a empresa")
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ clientes: CadastroContaAzul[] }> => {
    const db = solto(context.supabase);
    let companyId = data.companyId ?? null;
    if (!companyId && data.uid) {
      const { data: c } = await db.from("companies").select("id").eq("uid", data.uid).maybeSingle();
      companyId = (c as { id: string } | null)?.id ?? null;
    }
    if (!companyId) return { clientes: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adm = supabaseAdmin as unknown as SupabaseClient;
    let pode = await podeFaturar(db, context.userId);
    if (!pode) {
      const { count } = await adm
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("executivo_user_id", context.userId);
      pode = (count ?? 0) > 0;
    }
    if (!pode) return { clientes: [] };
    const { data: linhas } = await adm
      .from("ca_clientes")
      .select(
        "cliente_id, nome, documento, observacoes, email, telefone, emails_cobranca, outros_contatos, inscricao_estadual, inscricao_municipal, endereco, ativo, updated_at",
      )
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(5);
    type Linha = {
      cliente_id: string;
      nome: string | null;
      documento: string | null;
      observacoes: string | null;
      email: string | null;
      telefone: string | null;
      emails_cobranca: string[] | null;
      outros_contatos: CadastroContaAzul["outrosContatos"] | null;
      inscricao_estadual: string | null;
      inscricao_municipal: string | null;
      endereco: Record<string, string | null> | null;
      ativo: boolean | null;
      updated_at: string | null;
    };
    return {
      clientes: ((linhas ?? []) as Linha[]).map((l) => {
        const e = l.endereco ?? {};
        const endereco =
          [
            [e.logradouro, e.numero].filter(Boolean).join(", "),
            e.complemento,
            e.bairro,
            [e.cidade, e.estado].filter(Boolean).join("/"),
            e.cep,
          ]
            .filter(Boolean)
            .join(" · ") || null;
        return {
          clienteId: l.cliente_id,
          nome: l.nome,
          documento: l.documento,
          observacoes: l.observacoes,
          email: l.email,
          telefone: l.telefone,
          emailsCobranca: l.emails_cobranca ?? [],
          outrosContatos: Array.isArray(l.outros_contatos) ? l.outros_contatos : [],
          inscricaoEstadual: l.inscricao_estadual,
          inscricaoMunicipal: l.inscricao_municipal,
          endereco,
          ativo: l.ativo,
          atualizadoEm: l.updated_at,
        };
      }),
    };
  });
