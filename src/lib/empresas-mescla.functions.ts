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
    const { error } = await solto(context.supabase)
      .from("empresas_grupos_ignorados")
      .upsert({ grupo: data.grupo, ignorado_por: context.userId }, { onConflict: "grupo" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
