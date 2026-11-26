import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Empresas parecidas e mescla. Ver a lista: gestão, CS e comercial; mesclar,
 * ligar filiais, "não são a mesma" e desativar: só gestão (o banco confere de
 * novo). Quem não é gestão faz um pedido (empresas_solicitacoes) com o motivo;
 * a gestão aprova (a ação é executada) ou recusa, e quem pediu é avisado.
 * Grupos por mesmo CNPJ, mesmo domínio ou nome parecido (empresa_chave: sem
 * acento, pontuação e Ltda/S.A./Eireli…). Mesclar move contatos, leads,
 * negócios, cliente do CS, propostas, faturamento etc. para a empresa que
 * fica, completa os campos vazios dela e apaga a outra (fica registrada em
 * empresas_mescladas, e a transformação do RD respeita).
 */
const solto = (s: unknown) => s as SupabaseClient;

async function ehGestao(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.rpc("is_manager", { _user_id: userId });
  return data === true;
}

async function exigirGestao(db: SupabaseClient, userId: string, msg: string) {
  if (!(await ehGestao(db, userId))) throw new Error(msg);
}

/** Liga as filhas à mãe (criando a mãe pelo nome, se preciso). Quem chama confere a gestão. */
async function executarFiliais(
  db: SupabaseClient,
  d: { grupo: string; maeId: string | null; novaMaeNome: string; filhasIds: string[] },
) {
  let maeId = d.maeId;
  if (!maeId) {
    const { data: nova, error } = await db
      .from("companies")
      .insert({
        nome: d.novaMaeNome,
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
    _filhas: d.filhasIds.filter((id) => id !== maeId),
    _grupo: d.grupo,
  });
  if (error) throw new Error(error.message);
  return { maeId, ligadas: Number((r as { ligadas?: number } | null)?.ligadas ?? 0) };
}

/** Mescla as que saem na que fica, uma por vez, somando o que foi movido. */
async function executarMescla(db: SupabaseClient, ficaId: string, saiIds: string[]) {
  const movidos: Record<string, number> = {};
  for (const sai of saiIds) {
    const { data: r, error } = await db.rpc("mesclar_empresas", { _fica: ficaId, _sai: sai });
    if (error) throw new Error(error.message);
    for (const [k, v] of Object.entries(
      ((r as { movidos?: Record<string, number> } | null)?.movidos ?? {}) as Record<string, number>,
    ))
      movidos[k] = (movidos[k] ?? 0) + Number(v);
  }
  return { mescladas: saiIds.length, movidos };
}

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
    await exigirGestao(db, context.userId, "Só a gestão mescla empresas: peça a mescla");
    return executarMescla(db, data.ficaId, data.saiIds);
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
    await exigirGestao(db, context.userId, "Só a gestão organiza filiais");
    return executarFiliais(db, data);
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

/** Se quem está logado decide (gestão) ou só pede. */
export const souGestaoDeEmpresas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    gestao: await ehGestao(solto(context.supabase), context.userId),
  }));

/** Desativar ("excluir") ou reativar empresas: só a gestão. Some das listas, mantém o histórico. */
export const desativarEmpresas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(50), ativo: z.boolean().default(false) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigirGestao(db, context.userId, "Só a gestão exclui empresas: peça a exclusão");
    const { data: n, error } = await db.rpc("desativar_empresas", {
      _ids: data.ids,
      _ativo: data.ativo,
    });
    if (error) throw new Error(error.message);
    return { alteradas: Number(n ?? 0) };
  });

export type TipoPedidoEmpresa = "mesclar" | "excluir" | "filiais";
export const ROTULO_PEDIDO: Record<TipoPedidoEmpresa, string> = {
  mesclar: "Mesclar",
  excluir: "Excluir (desativar)",
  filiais: "São filiais",
};

const PedidoZ = z
  .object({
    tipo: z.enum(["mesclar", "excluir", "filiais"]),
    /** mesclar: a que fica; filiais: a mãe (null = criar novaMaeNome). */
    ficaId: z.string().uuid().nullable().default(null),
    novaMaeNome: z.string().trim().max(200).default(""),
    /** mesclar: as que saem; excluir: as que serão desativadas; filiais: as filhas. */
    alvoIds: z.array(z.string().uuid()).min(1).max(50),
    grupo: z.string().max(300).nullable().default(null),
    motivo: z.string().trim().min(5, "Conte o motivo do pedido").max(1000),
  })
  .refine((d) => d.tipo !== "mesclar" || !!d.ficaId, "Escolha a empresa que fica")
  .refine(
    (d) => d.tipo !== "filiais" || !!d.ficaId || d.novaMaeNome.length >= 2,
    "Escolha ou dê o nome da empresa-mãe",
  )
  .refine(
    (d) => !d.ficaId || !d.alvoIds.includes(d.ficaId),
    "A principal não pode estar entre as outras",
  );

async function nomesDasEmpresas(db: SupabaseClient, ids: string[]) {
  const mapa = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows } = await db
      .from("companies")
      .select("id, nome")
      .in("id", ids.slice(i, i + 200));
    for (const r of (rows ?? []) as Array<{ id: string; nome: string }>) mapa.set(r.id, r.nome);
  }
  return mapa;
}

function resumoDoPedido(p: {
  tipo: TipoPedidoEmpresa;
  fica_nome: string | null;
  nova_mae_nome: string | null;
  alvo_nomes: string[];
}) {
  const alvos = p.alvo_nomes.join(", ");
  if (p.tipo === "mesclar") return `mesclar ${alvos} em ${p.fica_nome ?? "—"}`;
  if (p.tipo === "filiais")
    return `ligar ${alvos} como filiais de ${p.fica_nome ?? p.nova_mae_nome ?? "—"}`;
  return `excluir (desativar) ${alvos}`;
}

/** Quem não é gestão pede; a gestão é avisada no sino. */
export const pedirAcaoEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PedidoZ.parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const nomes = await nomesDasEmpresas(db, [
      ...data.alvoIds,
      ...(data.ficaId ? [data.ficaId] : []),
    ]);
    const faltando = data.alvoIds.filter((id) => !nomes.has(id));
    if (faltando.length) throw new Error("Alguma empresa não foi encontrada");
    const linha = {
      tipo: data.tipo,
      fica_id: data.ficaId,
      fica_nome: data.ficaId ? (nomes.get(data.ficaId) ?? null) : null,
      nova_mae_nome: data.tipo === "filiais" && !data.ficaId ? data.novaMaeNome : null,
      alvo_ids: data.alvoIds,
      alvo_nomes: data.alvoIds.map((id) => nomes.get(id) ?? "—"),
      grupo: data.grupo,
      motivo: data.motivo,
      solicitado_por: context.userId,
    };
    const { data: nova, error } = await db
      .from("empresas_solicitacoes")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Aviso só no sino (são várias pessoas na gestão; e-mail a todas seria demais).
    const { data: gestores } = await db.rpc("ids_da_gestao");
    const para = ((gestores ?? []) as Array<string | { ids_da_gestao?: string }>)
      .map((g) => (typeof g === "string" ? g : g.ids_da_gestao))
      .filter((u): u is string => !!u && u !== context.userId)
      .slice(0, 50);
    if (para.length) {
      const { error: e } = await db.rpc("notificar_usuarios", {
        _users: para,
        _tipo: "mencao",
        _titulo: `Pedido para ${resumoDoPedido(linha)}`.slice(0, 200),
        _corpo: `Motivo: ${data.motivo}`.slice(0, 2000),
        _link: "/empresas-parecidas?aba=pedidos",
        _deal_id: null,
      });
      if (e) console.error("[pedirAcaoEmpresa] aviso", e.message);
    }
    return { id: (nova as { id: string }).id };
  });

export type PedidoEmpresa = {
  id: string;
  tipo: TipoPedidoEmpresa;
  resumo: string;
  ficaNome: string | null;
  novaMaeNome: string | null;
  alvoNomes: string[];
  motivo: string;
  status: "pendente" | "aprovada" | "recusada";
  solicitante: string;
  meu: boolean;
  solicitadoEm: string;
  decisor: string | null;
  decididoEm: string | null;
  observacao: string | null;
};

/** Gestão vê todos; os outros, os próprios (o RLS garante). */
export const listarPedidosDeEmpresas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data: rows, error }, { data: perfis }] = await Promise.all([
      db
        .from("empresas_solicitacoes")
        .select(
          "id, tipo, fica_nome, nova_mae_nome, alvo_nomes, motivo, status, solicitado_por, solicitado_em, decidido_por, decidido_em, observacao",
        )
        .order("solicitado_em", { ascending: false })
        .limit(300),
      db.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || "—"],
      ),
    );
    type Linha = {
      id: string;
      tipo: TipoPedidoEmpresa;
      fica_nome: string | null;
      nova_mae_nome: string | null;
      alvo_nomes: string[] | null;
      motivo: string;
      status: PedidoEmpresa["status"];
      solicitado_por: string;
      solicitado_em: string;
      decidido_por: string | null;
      decidido_em: string | null;
      observacao: string | null;
    };
    return ((rows ?? []) as Linha[]).map(
      (r): PedidoEmpresa => ({
        id: r.id,
        tipo: r.tipo,
        resumo: resumoDoPedido({ ...r, alvo_nomes: r.alvo_nomes ?? [] }),
        ficaNome: r.fica_nome,
        novaMaeNome: r.nova_mae_nome,
        alvoNomes: r.alvo_nomes ?? [],
        motivo: r.motivo,
        status: r.status,
        solicitante: nome.get(r.solicitado_por) ?? "—",
        meu: r.solicitado_por === context.userId,
        solicitadoEm: r.solicitado_em,
        decisor: r.decidido_por ? (nome.get(r.decidido_por) ?? "—") : null,
        decididoEm: r.decidido_em,
        observacao: r.observacao,
      }),
    );
  });

/**
 * A gestão aprova (a ação é executada na hora) ou recusa. O pedido é
 * "reservado" antes de executar, para não rodar duas vezes; se a ação falhar,
 * volta a pendente com o erro. Quem pediu recebe aviso no sino e por e-mail.
 */
export const decidirPedidoDeEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        aprovar: z.boolean(),
        observacao: z.string().trim().max(1000).default(""),
      })
      .refine((d) => d.aprovar || d.observacao.length >= 3, "Diga por que o pedido foi recusado")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigirGestao(db, context.userId, "Só a gestão decide os pedidos");
    const agora = new Date().toISOString();
    const { data: reservado, error: eRes } = await db
      .from("empresas_solicitacoes")
      .update({
        status: data.aprovar ? "aprovada" : "recusada",
        decidido_por: context.userId,
        decidido_em: agora,
        observacao: data.observacao || null,
      })
      .eq("id", data.id)
      .eq("status", "pendente")
      .select(
        "id, tipo, fica_id, fica_nome, nova_mae_nome, alvo_ids, alvo_nomes, grupo, solicitado_por",
      )
      .maybeSingle();
    if (eRes) throw new Error(eRes.message);
    if (!reservado) throw new Error("Este pedido já foi decidido");
    const p = reservado as {
      id: string;
      tipo: TipoPedidoEmpresa;
      fica_id: string | null;
      fica_nome: string | null;
      nova_mae_nome: string | null;
      alvo_ids: string[];
      alvo_nomes: string[] | null;
      grupo: string | null;
      solicitado_por: string;
    };

    let resultado: Record<string, unknown> = {};
    if (data.aprovar) {
      try {
        if (p.tipo === "mesclar") {
          if (!p.fica_id) throw new Error("A empresa que fica não existe mais");
          resultado = await executarMescla(db, p.fica_id, p.alvo_ids);
        } else if (p.tipo === "filiais") {
          if (!p.fica_id && !p.nova_mae_nome) throw new Error("A empresa-mãe não existe mais");
          resultado = await executarFiliais(db, {
            grupo: p.grupo ?? `pedido:${p.id}`,
            maeId: p.fica_id,
            novaMaeNome: p.nova_mae_nome ?? "",
            filhasIds: p.alvo_ids,
          });
        } else {
          const { data: n, error } = await db.rpc("desativar_empresas", {
            _ids: p.alvo_ids,
            _ativo: false,
          });
          if (error) throw new Error(error.message);
          resultado = { desativadas: Number(n ?? 0) };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao executar";
        await db
          .from("empresas_solicitacoes")
          .update({
            status: "pendente",
            decidido_por: null,
            decidido_em: null,
            resultado: { erro: msg, em: agora },
          })
          .eq("id", p.id);
        throw new Error(`Não deu para executar: ${msg}`);
      }
      await db.from("empresas_solicitacoes").update({ resultado }).eq("id", p.id);
    }

    const { notificar } = await import("@/lib/notificacoes.server");
    const resumo = resumoDoPedido({ ...p, alvo_nomes: p.alvo_nomes ?? [] });
    await notificar(db, context.userId, {
      para: [p.solicitado_por],
      tipo: "mencao",
      titulo: `${data.aprovar ? "Aprovado" : "Recusado"}: pedido para ${resumo}`,
      corpo: data.observacao ? `Observação da gestão: ${data.observacao}` : null,
      link: "/empresas-parecidas?aba=pedidos",
    });
    return { ok: true };
  });
