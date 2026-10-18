import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";
import { notificar, notificarFaturamento } from "@/lib/notificacoes.server";
import { licencaParaConferir, logisticaPadrao } from "@/lib/requerimentos/regras";
import { hojeSP } from "@/lib/datas-sp";

/*
 * Requerimento de serviço (comercial → ADM → trainer) e liberação de licença
 * PDA. Escrita pelo cliente do usuário: a RLS decide (ADM edita tudo; quem
 * abriu edita enquanto está "solicitado"; a trainer só registra briefing,
 * conclusão e o status da sessão dela, por função no banco).
 */
const solto = (s: unknown) => s as SupabaseClient;

const nomesDe = async (db: SupabaseClient) => {
  const { data } = await db.from("profiles").select("id, full_name, email");
  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
      (p) => [p.id, p.full_name || p.email || ""],
    ),
  );
};

async function eTrainer(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc("e_trainer", { _user_id: userId });
  return !!data;
}

// ---------------------------------------------------------------------------
// Lista e detalhe
// ---------------------------------------------------------------------------
export const listarRequerimentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.string().max(20).optional(),
        meus: z.boolean().optional(),
        dealId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let q = db
      .from("requerimentos")
      .select(
        "id, numero, status, servico, formato, deal_id, criado_por, created_at, companies:company_id(nome), requerimento_trainers(user_id), requerimento_sessoes(data, trainer_id, status)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status) q = q.eq("status", data.status);
    if (data.dealId) q = q.eq("deal_id", data.dealId);
    const [{ data: rows, error }, nomes, adm, trainer] = await Promise.all([
      q,
      nomesDe(db),
      podeFaturar(db, context.userId),
      eTrainer(db, context.userId),
    ]);
    if (error) throw new Error(error.message);
    const hoje = hojeSP();
    let itens = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const sess = (r.requerimento_sessoes ?? []) as Array<{
        data: string | null;
        trainer_id: string | null;
        status: string;
      }>;
      const trainers = new Set([
        ...((r.requerimento_trainers ?? []) as Array<{ user_id: string }>).map((t) => t.user_id),
        ...sess.map((s) => s.trainer_id).filter(Boolean),
      ] as string[]);
      const proxima = sess
        .filter((s) => s.data && s.data >= hoje && s.status !== "cancelado")
        .map((s) => s.data as string)
        .sort()[0];
      return {
        id: r.id as string,
        numero: Number(r.numero),
        status: r.status as string,
        servico: r.servico as string,
        formato: (r.formato as string | null) ?? null,
        empresa: (r.companies as { nome?: string } | null)?.nome ?? null,
        dealId: (r.deal_id as string | null) ?? null,
        criadoPor: nomes.get(r.criado_por as string) ?? null,
        criadoEm: r.created_at as string,
        trainers: [...trainers].map((t) => nomes.get(t) ?? "").filter(Boolean),
        souTrainer: trainers.has(context.userId),
        proximaSessao: proxima ?? null,
      };
    });
    if (data.meus) itens = itens.filter((i) => i.souTrainer);
    return { itens, podeFaturar: adm, eTrainer: trainer };
  });

export const getRequerimento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [
      { data: req, error },
      { data: trainers },
      { data: sessoes },
      nomes,
      adm,
      { data: roles },
    ] = await Promise.all([
      db
        .from("requerimentos")
        .select("*, companies:company_id(nome), deals:deal_id(nome, executivo_user_id)")
        .eq("id", data.id)
        .maybeSingle(),
      db.from("requerimento_trainers").select("user_id").eq("requerimento_id", data.id),
      db
        .from("requerimento_sessoes")
        .select("id, ordem, titulo, trainer_id, data, horario, formato, local, status")
        .eq("requerimento_id", data.id)
        .order("ordem"),
      nomesDe(db),
      podeFaturar(db, context.userId),
      db.from("user_roles").select("user_id, role").eq("role", "trainer"),
    ]);
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Requerimento não encontrado");
    const r = req as Record<string, unknown>;
    const ids = ((trainers ?? []) as Array<{ user_id: string }>).map((t) => t.user_id);
    const sess = (sessoes ?? []) as Array<Record<string, unknown>>;
    const souTrainer =
      ids.includes(context.userId) || sess.some((s) => s.trainer_id === context.userId);
    return {
      requerimento: r as Record<string, string | number | boolean | null | object>,
      trainerIds: ids,
      sessoes: sess as Array<{
        id: string;
        ordem: number;
        titulo: string;
        trainer_id: string | null;
        data: string | null;
        horario: string | null;
        formato: string | null;
        local: string | null;
        status: string;
      }>,
      nomes: Object.fromEntries(nomes),
      trainersDisponiveis: ((roles ?? []) as Array<{ user_id: string }>).map((t) => ({
        id: t.user_id,
        nome: nomes.get(t.user_id) ?? t.user_id,
      })),
      podeEditarTudo: adm,
      podeEditarComoCriador: r.criado_por === context.userId && r.status === "solicitado",
      souTrainer,
    };
  });

// ---------------------------------------------------------------------------
// Comercial abre
// ---------------------------------------------------------------------------
/** Abre o requerimento a partir do negócio ganho, já preenchido com o que o CRM sabe. */
export const criarRequerimentoDoNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: deal } = await db
      .from("deals")
      .select(
        "id, nome, company_id, contact_id, contato_faturamento_id, observacao_adm, companies:company_id(nome, cidade, estado)",
      )
      .eq("id", data.dealId)
      .maybeSingle();
    if (!deal) throw new Error("Negócio não encontrado");
    const d = deal as Record<string, unknown>;
    const empresa = d.companies as { nome?: string; cidade?: string; estado?: string } | null;

    const [{ data: itens }, { data: contato }] = await Promise.all([
      db
        .from("deal_products")
        .select("nome, quantidade, product_id, products:product_id(tipo, marca)")
        .eq("deal_id", data.dealId)
        .order("ordem"),
      d.contact_id || d.contato_faturamento_id
        ? db
            .from("contacts")
            .select("nome, email, telefone, cargo")
            .eq("id", (d.contact_id ?? d.contato_faturamento_id) as string)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const lista = (itens ?? []) as Array<{
      nome: string;
      quantidade: number;
      product_id: string | null;
      products: { tipo?: string; marca?: string } | null;
    }>;
    const servicos = lista.filter((i) => i.products?.tipo === "servico");
    const produtos = lista.filter((i) => i.products?.tipo === "produto");
    const c = contato as {
      nome?: string;
      email?: string;
      telefone?: string;
      cargo?: string;
    } | null;

    const { data: novo, error } = await db
      .from("requerimentos")
      .insert({
        deal_id: data.dealId,
        company_id: d.company_id,
        servico: servicos.map((s) => s.nome).join(" + ") || String(d.nome),
        product_id: servicos[0]?.product_id ?? null,
        quantidade: servicos.map((s) => `${s.quantidade}× ${s.nome}`).join(", ") || null,
        plataforma: produtos.map((p) => p.nome).join(", ") || null,
        contratante_nome: c?.nome ?? null,
        contratante_email: c?.email ?? null,
        contratante_telefone: c?.telefone ?? null,
        contratante_cargo: c?.cargo ?? null,
        cidade_uf: [empresa?.cidade, empresa?.estado].filter(Boolean).join("/") || null,
        objetivo: (d.observacao_adm as string | null) ?? null,
        formato: "online",
        logistica: logisticaPadrao("online"),
        criado_por: context.userId,
      })
      .select("id, numero")
      .single();
    if (error) throw new Error(error.message);
    const r = novo as { id: string; numero: number };
    await notificarFaturamento(db, {
      tipo: "requerimento",
      titulo: `Novo requerimento de serviço nº ${r.numero}: ${empresa?.nome ?? d.nome}`,
      link: `/requerimento/${r.id}`,
      dealId: data.dealId,
    });
    return { id: r.id };
  });

const logisticaInput = z
  .array(
    z.object({
      grupo: z.enum(["online", "presencial", "assessment"]),
      item: z.string().max(200),
      necessario: z.boolean().nullable(),
      responsavel: z.string().max(120),
      observacao: z.string().max(500),
    }),
  )
  .max(40);

const textoOpc = (max: number) => z.string().trim().max(max).nullable().optional();

/** Campos do requerimento (ADM sempre; quem abriu enquanto "solicitado"). */
export const salvarRequerimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum([
            "solicitado",
            "em_preparacao",
            "agendado",
            "em_execucao",
            "concluido",
            "cancelado",
          ])
          .optional(),
        plataforma: textoOpc(200),
        contratante_nome: textoOpc(160),
        contratante_email: textoOpc(200),
        contratante_telefone: textoOpc(40),
        contratante_cargo: textoOpc(120),
        contratante_area: textoOpc(120),
        contexto_cliente: textoOpc(8000),
        servico: z.string().trim().min(2).max(300).optional(),
        publico: textoOpc(300),
        quantidade: textoOpc(300),
        produtos_avaliacao: textoOpc(120),
        formato: z.enum(["online", "presencial", "hibrido"]).nullable().optional(),
        carga_horaria: textoOpc(60),
        data_texto: textoOpc(120),
        horario_texto: textoOpc(120),
        local: textoOpc(300),
        cidade_uf: textoOpc(120),
        base_avaliacao: textoOpc(120),
        plataforma_transmissao: textoOpc(120),
        materiais: z.boolean().nullable().optional(),
        lista_participantes_url: z.string().trim().url().max(500).nullable().optional(),
        objetivo: textoOpc(8000),
        observacoes_adm: textoOpc(8000),
        logistica: logisticaInput.optional(),
        apoio_adm_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { id, ...campos } = data;
    const patch = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
    if (patch.status && patch.status !== "solicitado" && !(await podeFaturar(db, context.userId)))
      throw new Error("Só o ADM muda o andamento do requerimento");
    const { data: ok, error } = await db
      .from("requerimentos")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!ok?.length)
      throw new Error("Sem permissão: depois que o ADM pega o requerimento, só ele edita");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// ADM escala trainers e monta o cronograma
// ---------------------------------------------------------------------------
export const salvarCronograma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        trainerIds: z.array(z.string().uuid()).max(20),
        sessoes: z
          .array(
            z.object({
              id: z.string().uuid().optional(),
              titulo: z.string().trim().min(1).max(200),
              trainer_id: z.string().uuid().nullable(),
              data: z.string().date().nullable(),
              horario: z.string().trim().max(60).nullable(),
              formato: z.enum(["online", "presencial"]).nullable(),
              local: z.string().trim().max(300).nullable(),
              // Só vem quando o ADM mudou (ou sessão nova): não pisa no que a
              // trainer confirmou enquanto a tela estava aberta.
              status: z.enum(["a_confirmar", "confirmado", "realizado", "cancelado"]).optional(),
            }),
          )
          .max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId)))
      throw new Error("Só o ADM escala trainers e monta o cronograma");

    const [{ data: antesT }, { data: antesS }, { data: req }] = await Promise.all([
      db.from("requerimento_trainers").select("user_id").eq("requerimento_id", data.id),
      db.from("requerimento_sessoes").select("id, trainer_id").eq("requerimento_id", data.id),
      db
        .from("requerimentos")
        .select("numero, servico, companies:company_id(nome)")
        .eq("id", data.id)
        .maybeSingle(),
    ]);
    const jaEstavam = new Set([
      ...((antesT ?? []) as Array<{ user_id: string }>).map((t) => t.user_id),
      ...((antesS ?? []) as Array<{ trainer_id: string | null }>).map((s) => s.trainer_id),
    ]);

    // trainers: substitui a lista
    const { error: delT } = await db
      .from("requerimento_trainers")
      .delete()
      .eq("requerimento_id", data.id);
    if (delT) throw new Error(delT.message);
    if (data.trainerIds.length) {
      const { error } = await db
        .from("requerimento_trainers")
        .insert(data.trainerIds.map((user_id) => ({ requerimento_id: data.id, user_id })));
      if (error) throw new Error(error.message);
    }

    // sessões: atualiza as que existem, cria as novas, remove as que saíram
    const doRequerimento = new Set(((antesS ?? []) as Array<{ id: string }>).map((x) => x.id));
    const manter = new Set(data.sessoes.map((x) => x.id).filter(Boolean));
    const remover = [...doRequerimento].filter((sid) => !manter.has(sid));
    for (const [ordem, sessao] of data.sessoes.entries()) {
      const { id: sid, ...campos } = sessao;
      if (sid && !doRequerimento.has(sid)) throw new Error("Sessão de outro requerimento");
      const linha = { ...campos, ordem, requerimento_id: data.id };
      const { error } = sid
        ? await db
            .from("requerimento_sessoes")
            .update(linha)
            .eq("id", sid)
            .eq("requerimento_id", data.id)
        : await db
            .from("requerimento_sessoes")
            .insert({ ...linha, status: sessao.status ?? "a_confirmar" });
      if (error) throw new Error(error.message);
    }
    if (remover.length) {
      const { error } = await db.from("requerimento_sessoes").delete().in("id", remover);
      if (error) throw new Error(error.message);
    }

    const r = req as {
      numero: number;
      servico: string;
      companies: { nome?: string } | null;
    } | null;
    const novos = [
      ...new Set([...data.trainerIds, ...data.sessoes.map((s) => s.trainer_id)].filter(Boolean)),
    ].filter((t) => !jaEstavam.has(t as string)) as string[];
    await notificar(db, context.userId, {
      para: novos,
      tipo: "trainer",
      titulo: `Você foi escalada no requerimento nº ${r?.numero ?? ""}: ${r?.servico ?? ""}`,
      corpo: r?.companies?.nome ?? null,
      link: `/requerimento/${data.id}`,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------
export const trainerRegistra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        briefingEm: z.string().date().nullable(),
        briefingTexto: z.string().max(20000).nullable(),
        conclusaoEm: z.string().date().nullable(),
        conclusaoTexto: z.string().max(20000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: antes } = await db
      .from("requerimentos")
      .select("numero, servico, conclusao_em, criado_por, deal_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db.rpc("trainer_registra_requerimento", {
      _req: data.id,
      _briefing_em: data.briefingEm,
      _briefing_texto: data.briefingTexto,
      _conclusao_em: data.conclusaoEm,
      _conclusao_texto: data.conclusaoTexto,
    });
    if (error) throw new Error(error.message);
    const a = antes as {
      numero: number;
      servico: string;
      conclusao_em: string | null;
      criado_por: string | null;
      deal_id: string | null;
    } | null;
    // Conclusão nova: o comercial fica sabendo o que foi entregue.
    if (a && !a.conclusao_em && data.conclusaoEm) {
      await notificar(db, context.userId, {
        para: [a.criado_por],
        tipo: "requerimento",
        titulo: `Entrega concluída: requerimento nº ${a.numero} (${a.servico})`,
        corpo: data.conclusaoTexto,
        link: `/requerimento/${data.id}`,
        dealId: a.deal_id,
      });
      await notificarFaturamento(db, {
        tipo: "requerimento",
        titulo: `Trainer concluiu o requerimento nº ${a.numero}`,
        link: `/requerimento/${data.id}`,
        dealId: a.deal_id,
      });
    }
    return { ok: true };
  });

export const trainerStatusSessao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sessaoId: z.string().uuid(),
        status: z.enum(["a_confirmar", "confirmado", "realizado"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await solto(context.supabase).rpc("trainer_status_sessao", {
      _sessao: data.sessaoId,
      _status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Licenças PDA
// ---------------------------------------------------------------------------
export const listarLicencas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ dealId: z.string().uuid().optional(), abertas: z.boolean().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let q = db
      .from("licencas_pda")
      .select(
        "id, deal_id, descricao, tipo, quantidade, login_email, status, solicitado_em, liberado_em, observacao, created_at, companies:company_id(nome), deals:deal_id(nome)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.dealId) q = q.eq("deal_id", data.dealId);
    if (data.abertas) q = q.in("status", ["a_solicitar", "solicitado"]);
    const [{ data: rows, error }, adm] = await Promise.all([q, podeFaturar(db, context.userId)]);
    if (error) throw new Error(error.message);
    const agora = new Date();
    return {
      podeEditar: adm,
      itens: ((rows ?? []) as Array<Record<string, unknown>>).map((l) => ({
        id: l.id as string,
        dealId: (l.deal_id as string | null) ?? null,
        empresa: (l.companies as { nome?: string } | null)?.nome ?? null,
        negocio: (l.deals as { nome?: string } | null)?.nome ?? null,
        descricao: l.descricao as string,
        tipo: l.tipo as string,
        quantidade: (l.quantidade as number | null) ?? null,
        loginEmail: (l.login_email as string | null) ?? null,
        status: l.status as string,
        solicitadoEm: (l.solicitado_em as string | null) ?? null,
        liberadoEm: (l.liberado_em as string | null) ?? null,
        observacao: (l.observacao as string | null) ?? null,
        paraConferir: licencaParaConferir(
          { status: l.status as string, solicitado_em: (l.solicitado_em as string | null) ?? null },
          agora,
        ),
      })),
    };
  });

/** Cria os pedidos de liberação a partir dos itens PDA (produto) do negócio. */
export const criarLicencasDoNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId)))
      throw new Error("Só o ADM pede liberação de licença");
    const [{ data: deal }, { data: itens }, { data: ja }] = await Promise.all([
      db
        .from("deals")
        .select("company_id, contato_faturamento_id, contacts:contato_faturamento_id(email)")
        .eq("id", data.dealId)
        .maybeSingle(),
      db
        .from("deal_products")
        .select("nome, quantidade, products:product_id(tipo, marca, subcategoria)")
        .eq("deal_id", data.dealId),
      db.from("licencas_pda").select("descricao").eq("deal_id", data.dealId),
    ]);
    const existentes = new Set(
      ((ja ?? []) as Array<{ descricao: string }>).map((x) => x.descricao),
    );
    const d = deal as {
      company_id: string | null;
      contato_faturamento_id: string | null;
      contacts: { email?: string } | null;
    } | null;
    const novos = (
      (itens ?? []) as Array<{
        nome: string;
        quantidade: number;
        products: { tipo?: string; marca?: string; subcategoria?: string } | null;
      }>
    )
      .filter((i) => i.products?.tipo === "produto" && i.products?.marca === "PDA")
      .filter((i) => !existentes.has(i.nome))
      .map((i) => {
        const sub = (i.products?.subcategoria ?? "").toLowerCase();
        return {
          deal_id: data.dealId,
          company_id: d?.company_id ?? null,
          descricao: i.nome,
          tipo: sub.includes("recarga")
            ? "recarga"
            : sub.includes("partner")
              ? "partner"
              : sub.includes("crédito")
                ? "credito"
                : "licenca",
          // "PACOTE 10 - LIC. 1.000" → 1000 (o último número do nome)
          quantidade:
            Number((i.nome.match(/(\d[\d.]*)\s*$/)?.[1] ?? "").replace(/\./g, "")) || null,
          login_contato_id: d?.contato_faturamento_id ?? null,
          login_email: d?.contacts?.email ?? null,
        };
      });
    if (novos.length === 0) return { criadas: 0 };
    const { error } = await db.from("licencas_pda").insert(novos);
    if (error) throw new Error(error.message);
    return { criadas: novos.length };
  });

export const mudarStatusLicenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["a_solicitar", "solicitado", "liberado", "cancelado"]),
        loginEmail: z.string().trim().email().max(200).nullable().optional(),
        observacao: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId))) throw new Error("Só o ADM mexe na liberação");
    const agora = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "solicitado")
      Object.assign(patch, { solicitado_em: agora, solicitado_por: context.userId });
    if (data.status === "liberado")
      Object.assign(patch, { liberado_em: agora, liberado_por: context.userId });
    if (data.loginEmail !== undefined) patch.login_email = data.loginEmail;
    if (data.observacao !== undefined) patch.observacao = data.observacao;
    const { data: l, error } = await db
      .from("licencas_pda")
      .update(patch)
      .eq("id", data.id)
      .select("descricao, deal_id, deals:deal_id(nome, executivo_user_id)")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const lic = l as {
      descricao: string;
      deal_id: string | null;
      deals: { nome?: string; executivo_user_id?: string } | null;
    } | null;
    if (data.status === "liberado" && lic?.deals?.executivo_user_id)
      await notificar(db, context.userId, {
        para: [lic.deals.executivo_user_id],
        tipo: "licenca",
        titulo: `Licença liberada: ${lic.descricao}`,
        corpo: lic.deals.nome ?? null,
        link: lic.deal_id ? `/negocio/${lic.deal_id}` : null,
        dealId: lic.deal_id,
      });
    return { ok: true };
  });
