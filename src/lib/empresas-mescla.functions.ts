import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Empresas parecidas e mescla (só gestão; o banco confere de novo).
 * Grupos por mesmo CNPJ, mesmo domínio ou nome parecido (empresa_chave: sem
 * acento, pontuação e Ltda/S.A./Eireli…). Mesclar move contatos, leads,
 * negócios, cliente do CS, propostas, faturamento etc. para a empresa que
 * fica, completa os campos vazios dela e apaga a outra (fica registrada em
 * empresas_mescladas, e a transformação do RD respeita).
 */
const solto = (s: unknown) => s as SupabaseClient;

export type EmpresaParecida = {
  id: string;
  uid: string;
  nome: string;
  cnpj: string | null;
  dominio: string | null;
  local: string | null;
  rdOrgId: string | null;
  cliente: boolean;
  contatos: number;
  leads: number;
  negocios: number;
  criadoEm: string;
  /** Empresa-mãe, se já é filial de alguma. */
  maeId: string | null;
  maeNome: string | null;
  /** Quantas filiais já tem. */
  filiais: number;
};

export type GrupoDeParecidas = { grupo: string; motivo: string; empresas: EmpresaParecida[] };

export const listarEmpresasParecidas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ limite: z.number().int().min(1).max(2000).default(300) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await solto(context.supabase).rpc("empresas_parecidas", {
      _limite: data.limite,
    });
    if (error) throw new Error(error.message);
    const grupos = new Map<string, GrupoDeParecidas>();
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const g = String(r.grupo);
      if (!grupos.has(g)) grupos.set(g, { grupo: g, motivo: String(r.motivo), empresas: [] });
      grupos.get(g)!.empresas.push({
        id: String(r.id),
        uid: String(r.uid),
        nome: String(r.nome),
        cnpj: (r.cnpj as string) ?? null,
        dominio: (r.dominio as string) ?? null,
        local: [r.cidade, r.estado].filter(Boolean).join(" / ") || null,
        rdOrgId: (r.rd_org_id as string) ?? null,
        cliente: r.cliente === true,
        contatos: Number(r.contatos ?? 0),
        leads: Number(r.leads ?? 0),
        negocios: Number(r.negocios ?? 0),
        criadoEm: String(r.criado_em),
        maeId: (r.mae_id as string) ?? null,
        maeNome: (r.mae_nome as string) ?? null,
        filiais: Number(r.filiais ?? 0),
      });
    }
    return [...grupos.values()];
  });

/** Empresas pelo nome ou CNPJ, para mesclar duas que a lista não juntou. */
export const buscarEmpresasParaMesclar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const b = data.q.replace(/[%,()]/g, " ").trim();
    const dig = b.replace(/\D/g, "");
    const { data: rows, error } = await solto(context.supabase)
      .from("companies")
      .select("id, uid, nome, cnpj, dominio, cidade, estado")
      .or(
        [`nome.ilike.%${b}%`, dig.length >= 4 ? `cnpj.ilike.%${dig}%` : null]
          .filter(Boolean)
          .join(","),
      )
      .eq("ativo", true)
      .order("nome")
      .limit(15);
    if (error) throw new Error(error.message);
    return (
      (rows ?? []) as Array<{
        id: string;
        uid: string;
        nome: string;
        cnpj: string | null;
        dominio: string | null;
        cidade: string | null;
        estado: string | null;
      }>
    ).map((r) => ({
      id: r.id,
      uid: r.uid,
      nome: r.nome,
      detalhe: [r.cnpj, r.dominio, [r.cidade, r.estado].filter(Boolean).join("/")]
        .filter(Boolean)
        .join(" · "),
    }));
  });

/** Mescla as que saem na que fica, uma por vez. */
export const mesclarEmpresas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ficaId: z.string().uuid(),
        saiIds: z.array(z.string().uuid()).min(1).max(20),
      })
      .refine((d) => !d.saiIds.includes(d.ficaId), "A empresa que fica não pode sair")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const movidos: Record<string, number> = {};
    for (const sai of data.saiIds) {
      const { data: r, error } = await db.rpc("mesclar_empresas", {
        _fica: data.ficaId,
        _sai: sai,
      });
      if (error) throw new Error(error.message);
      for (const [k, v] of Object.entries(
        ((r as { movidos?: Record<string, number> } | null)?.movidos ?? {}) as Record<
          string,
          number
        >,
      ))
        movidos[k] = (movidos[k] ?? 0) + Number(v);
    }
    return { mescladas: data.saiIds.length, movidos };
  });

/** "Não são a mesma empresa": tira o grupo da lista. */
export const ignorarGrupoDeParecidas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ grupo: z.string().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await solto(context.supabase).from("empresas_grupos_ignorados").upsert(
      {
        grupo: data.grupo,
        decisao: "diferentes",
        ignorado_por: context.userId,
        ignorado_em: new Date().toISOString(),
      },
      { onConflict: "grupo" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * "São filiais": liga as selecionadas a uma empresa-mãe (do grupo, outra já
 * cadastrada ou uma nova, criada aqui) sem mesclar nada.
 */
export const ligarFiliais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        grupo: z.string().min(3).max(300),
        maeId: z.string().uuid().nullable(),
        novaMaeNome: z.string().trim().max(200).default(""),
        filhasIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .refine((d) => d.maeId || d.novaMaeNome.length >= 2, "Escolha ou dê o nome da empresa-mãe")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: gestao } = await db.rpc("is_manager", { _user_id: context.userId });
    if (!gestao) throw new Error("Só a gestão organiza filiais");
    let maeId = data.maeId;
    if (!maeId) {
      const { data: nova, error } = await db
        .from("companies")
        .insert({
          nome: data.novaMaeNome,
          tipo_lead: "empresa",
          provenance: { origem: "empresa_mae_das_filiais" },
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      maeId = (nova as { id: string }).id;
    }
    const { data: r, error } = await db.rpc("ligar_filiais", {
      _mae: maeId,
      _filhas: data.filhasIds.filter((id) => id !== maeId),
      _grupo: data.grupo,
    });
    if (error) throw new Error(error.message);
    return { maeId, ligadas: Number((r as { ligadas?: number } | null)?.ligadas ?? 0) };
  });

/** O que a gestão já decidiu: filiais, "não são a mesma" e mesclas. */
export const listarRevisoesDeParecidas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data: decisoes, error }, { data: mesclas }, { data: perfis }] = await Promise.all([
      db
        .from("empresas_grupos_ignorados")
        .select("grupo, decisao, mae_id, filhas, ignorado_por, ignorado_em")
        .order("ignorado_em", { ascending: false })
        .limit(300),
      db
        .from("empresas_mescladas")
        .select("id, fica_id, sai_nome, mesclado_por, mesclado_em, movidos")
        .order("mesclado_em", { ascending: false })
        .limit(300),
      db.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nomePessoa = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || "—"],
      ),
    );
    type Dec = {
      grupo: string;
      decisao: string;
      mae_id: string | null;
      filhas: string[] | null;
      ignorado_por: string | null;
      ignorado_em: string;
    };
    type Mes = {
      id: string;
      fica_id: string;
      sai_nome: string | null;
      mesclado_por: string | null;
      mesclado_em: string;
      movidos: Record<string, number> | null;
    };
    const decs = (decisoes ?? []) as Dec[];
    const mes = (mesclas ?? []) as Mes[];
    const ids = [
      ...new Set([
        ...decs.flatMap((d) => [d.mae_id, ...(d.filhas ?? [])]),
        ...mes.map((m) => m.fica_id),
      ]),
    ].filter((x): x is string => !!x);
    const nomeEmpresa = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: rows } = await db
        .from("companies")
        .select("id, nome")
        .in("id", ids.slice(i, i + 200));
      for (const r of (rows ?? []) as Array<{ id: string; nome: string }>)
        nomeEmpresa.set(r.id, r.nome);
    }
    return {
      decisoes: decs.map((d) => ({
        grupo: d.grupo,
        decisao: d.decisao as "diferentes" | "filiais",
        mae: d.mae_id ? (nomeEmpresa.get(d.mae_id) ?? "—") : null,
        filhas: (d.filhas ?? []).map((f) => nomeEmpresa.get(f) ?? "—"),
        por: d.ignorado_por ? (nomePessoa.get(d.ignorado_por) ?? "—") : "—",
        em: d.ignorado_em,
      })),
      mesclas: mes.map((m) => ({
        id: m.id,
        fica: nomeEmpresa.get(m.fica_id) ?? "—",
        saiu: m.sai_nome ?? "—",
        movidos: Object.values(m.movidos ?? {}).reduce((a, b) => a + Number(b), 0),
        por: m.mesclado_por ? (nomePessoa.get(m.mesclado_por) ?? "—") : "—",
        em: m.mesclado_em,
      })),
    };
  });

/** Reabre um grupo: "não são a mesma" volta para a lista; "filiais" solta as filhas. */
export const reabrirGrupoDeParecidas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ grupo: z.string().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await solto(context.supabase).rpc("reabrir_grupo_de_parecidas", {
      _grupo: data.grupo,
    });
    if (error) throw new Error(error.message);
    return r as { ok: boolean; soltas?: number };
  });
