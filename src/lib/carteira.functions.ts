import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emLotes, todasAsPaginas } from "@/lib/paginar.server";

/*
 * Funis de conta (Gestão da Carteira Comercial). O card é a empresa: entra
 * quando ganha a primeira venda e fica enquanto for cliente. O dono da conta
 * quem define é a gestão; o banco recusa a troca feita por outra pessoa.
 */
const solto = (s: unknown) => s as SupabaseClient;

type Card = {
  id: string;
  company_id: string;
  stage_id: string | null;
  owner_user_id: string | null;
  stage_entered_at: string;
  observacao: string | null;
};

export const getCarteira = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ pipelineSlug: z.string().max(80).default("gestao-carteira-comercial") })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: gestao }, { data: pipelines }] = await Promise.all([
      db.rpc("is_manager", { _user_id: context.userId }),
      db
        .from("pipelines")
        .select("id, nome, slug")
        .eq("tipo", "conta")
        .eq("ativo", true)
        .order("ordem"),
    ]);
    const lista = (pipelines ?? []) as Array<{ id: string; nome: string; slug: string }>;
    const pipe = lista.find((p) => p.slug === data.pipelineSlug) ?? lista[0];
    if (!pipe)
      return {
        gestao: !!gestao,
        pipelines: [],
        pipelineId: null,
        stages: [],
        cards: [],
        executivos: [],
      };

    const [{ data: stages }, cards] = await Promise.all([
      db
        .from("pipeline_stages")
        .select("id, nome, ordem, kind")
        .eq("pipeline_id", pipe.id)
        .order("ordem"),
      todasAsPaginas<Card>((de, ate) =>
        db
          .from("company_funis")
          .select("id, company_id, stage_id, owner_user_id, stage_entered_at, observacao")
          .eq("pipeline_id", pipe.id)
          .order("id")
          .range(de, ate),
      ),
    ]);

    const companyIds = [...new Set(cards.map((c) => c.company_id))];
    const [empresas, licencas, { data: roles }] = await Promise.all([
      emLotes<{ id: string; uid: string; nome: string; tipo_lead: string }>(companyIds, (lote) =>
        db.from("companies").select("id, uid, nome, tipo_lead").in("id", lote),
      ),
      emLotes<{ company_id: string; client_uid: string; data_renovacao: string | null }>(
        companyIds,
        (lote) =>
          db
            .from("cs_clients")
            .select("company_id, client_uid, data_renovacao")
            .in("company_id", lote),
      ),
      db.from("user_roles").select("user_id").eq("role", "executivo"),
    ]);
    const empresaDe = new Map(empresas.map((e) => [e.id, e]));
    const venceDe = new Map<string, string>();
    // A página da empresa hoje é a ficha do CS: só há link quando ela existe.
    const fichaDe = new Map<string, string>();
    for (const l of licencas) {
      fichaDe.set(l.company_id, l.client_uid);
      if (!l.data_renovacao) continue;
      const atual = venceDe.get(l.company_id);
      if (!atual || l.data_renovacao > atual) venceDe.set(l.company_id, l.data_renovacao);
    }

    const pessoaIds = [
      ...new Set([
        ...((roles ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
        ...cards.map((c) => c.owner_user_id).filter((x): x is string => !!x),
      ]),
    ];
    const pessoas = await emLotes<{ id: string; full_name: string | null; email: string | null }>(
      pessoaIds,
      (lote) => db.from("profiles").select("id, full_name, email").in("id", lote),
    );
    const executivoIds = new Set(
      ((roles ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    );

    return {
      gestao: !!gestao,
      pipelines: lista.map((p) => ({ id: p.id, nome: p.nome, slug: p.slug })),
      pipelineId: pipe.id,
      stages: (
        (stages ?? []) as Array<{ id: string; nome: string; ordem: number; kind: string }>
      ).map((s) => ({ id: s.id, nome: s.nome, ordem: s.ordem, kind: s.kind })),
      cards: cards.map((c) => {
        const e = empresaDe.get(c.company_id);
        return {
          id: c.id,
          stageId: c.stage_id,
          ownerId: c.owner_user_id,
          desde: c.stage_entered_at,
          observacao: c.observacao,
          empresa: {
            id: c.company_id,
            fichaCs: fichaDe.get(c.company_id) ?? null,
            nome: e?.nome ?? "(empresa)",
            consultoria: e?.tipo_lead === "consultoria",
          },
          licencaVenceEm: venceDe.get(c.company_id) ?? null,
        };
      }),
      executivos: pessoas
        .map((p) => ({
          id: p.id,
          nome: p.full_name || p.email || p.id,
          executivo: executivoIds.has(p.id),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  });

export const moverNaCarteira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ cardId: z.string().uuid(), stageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await solto(context.supabase)
      .from("company_funis")
      .update({ stage_id: data.stageId })
      .eq("id", data.cardId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Só o dono da conta ou a gestão movem este card");
    return { ok: true };
  });

export const definirDonoDaConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ cardId: z.string().uuid(), ownerId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: rows, error } = await db
      .from("company_funis")
      .update({ owner_user_id: data.ownerId })
      .eq("id", data.cardId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Só a gestão define o dono da conta");
    return { ok: true };
  });
