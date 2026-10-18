import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";
import { notificar, notificarFaturamento } from "@/lib/notificacoes.server";

/*
 * Solicitação de contrato (minuta/aditivo) e turmas com inscrição. A RLS
 * decide quem escreve: o comercial solicita/inscreve, o ADM conduz.
 */
const solto = (s: unknown) => s as SupabaseClient;
const opc = (max: number) => z.string().trim().max(max).nullable().optional();

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------
export const STATUS_CONTRATO = [
  { v: "solicitado", l: "Solicitado" },
  { v: "em_elaboracao", l: "Em elaboração" },
  { v: "enviado", l: "Enviado ao cliente" },
  { v: "em_ajuste", l: "Cliente pediu ajuste" },
  { v: "assinado", l: "Assinado" },
  { v: "cancelado", l: "Cancelado" },
] as const;

export const listarContratos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ dealId: z.string().uuid().optional(), abertos: z.boolean().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let q = db
      .from("contrato_solicitacoes")
      .select(
        "id, deal_id, tipo, compra, vencimento, regras_parcelamento, valor_bruto, contato_envio, modelo_compra, observacoes, ficha_url, proposta_url, status, contrato_url, solicitado_por, created_at, companies:company_id(nome), deals:deal_id(nome)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.dealId) q = q.eq("deal_id", data.dealId);
    if (data.abertos) q = q.not("status", "in", "(assinado,cancelado)");
    const [{ data: rows, error }, adm] = await Promise.all([q, podeFaturar(db, context.userId)]);
    if (error) throw new Error(error.message);
    return {
      podeConduzir: adm,
      itens: ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        dealId: (r.deal_id as string | null) ?? null,
        tipo: r.tipo as "minuta" | "aditivo" | "minuta_geral",
        compra: (r.compra as string | null) ?? null,
        vencimento: (r.vencimento as string | null) ?? null,
        regrasParcelamento: (r.regras_parcelamento as string | null) ?? null,
        valorBruto: r.valor_bruto == null ? null : Number(r.valor_bruto),
        contatoEnvio: (r.contato_envio as string | null) ?? null,
        modeloCompra: (r.modelo_compra as string | null) ?? null,
        observacoes: (r.observacoes as string | null) ?? null,
        fichaUrl: (r.ficha_url as string | null) ?? null,
        propostaUrl: (r.proposta_url as string | null) ?? null,
        status: r.status as string,
        contratoUrl: (r.contrato_url as string | null) ?? null,
        criadoEm: r.created_at as string,
        empresa: (r.companies as { nome?: string } | null)?.nome ?? null,
        negocio: (r.deals as { nome?: string } | null)?.nome ?? null,
        meu: r.solicitado_por === context.userId,
      })),
    };
  });

const contratoCampos = {
  tipo: z.enum(["minuta", "aditivo", "minuta_geral"]),
  compra: opc(2000),
  vencimento: z.string().date().nullable().optional(),
  regras_parcelamento: opc(1000),
  valor_bruto: z.number().min(0).max(100_000_000).nullable().optional(),
  contato_envio: opc(300),
  modelo_compra: opc(1000),
  observacoes: opc(4000),
  ficha_url: z.string().trim().url().max(500).nullable().optional(),
  proposta_url: z.string().trim().url().max(500).nullable().optional(),
};

export const solicitarContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid(), ...contratoCampos }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { dealId, ...campos } = data;
    const { data: deal } = await db
      .from("deals")
      .select("company_id, nome")
      .eq("id", dealId)
      .maybeSingle();
    const { error } = await db.from("contrato_solicitacoes").insert({
      ...campos,
      deal_id: dealId,
      company_id: (deal as { company_id: string | null } | null)?.company_id ?? null,
      solicitado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    await notificarFaturamento(db, {
      tipo: "contrato",
      titulo: `Pedido de ${data.tipo === "aditivo" ? "aditivo" : "minuta"}: ${(deal as { nome?: string } | null)?.nome ?? ""}`,
      link: "/faturamento",
      dealId,
    });
    return { ok: true };
  });

export const atualizarContrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum(["solicitado", "em_elaboracao", "enviado", "em_ajuste", "assinado", "cancelado"])
          .optional(),
        contrato_url: z.string().trim().url().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId)))
      throw new Error("Quem conduz o contrato é o Administrativo");
    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "enviado") patch.enviado_em = new Date().toISOString();
      if (data.status === "assinado") patch.assinado_em = new Date().toISOString();
      if (data.status !== "solicitado") patch.responsavel_id = context.userId;
    }
    if (data.contrato_url !== undefined) patch.contrato_url = data.contrato_url;
    const { data: c, error } = await db
      .from("contrato_solicitacoes")
      .update(patch)
      .eq("id", data.id)
      .select("solicitado_por, deal_id, status, deals:deal_id(nome)")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const ct = c as {
      solicitado_por: string | null;
      deal_id: string | null;
      status: string;
      deals: { nome?: string } | null;
    } | null;
    if (data.status && ct)
      await notificar(db, context.userId, {
        para: [ct.solicitado_por],
        tipo: "contrato",
        titulo: `Contrato de ${ct.deals?.nome ?? "seu negócio"}: ${STATUS_CONTRATO.find((s) => s.v === ct.status)?.l ?? ct.status}`,
        link: ct.deal_id ? `/negocio/${ct.deal_id}` : null,
        dealId: ct.deal_id,
      });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Turmas
// ---------------------------------------------------------------------------
export const listarTurmas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data: turmas, error }, { data: insc }, { data: perfis }, adm] = await Promise.all([
      db
        .from("turmas")
        .select(
          "id, nome, formato, inicio, fim, horario, vagas, trainer_id, local, status, products:product_id(nome)",
        )
        .order("inicio", { ascending: false, nullsFirst: true })
        .limit(200),
      db.from("turma_inscricoes").select("turma_id, status"),
      db.from("profiles").select("id, full_name, email"),
      podeFaturar(db, context.userId),
    ]);
    if (error) throw new Error(error.message);
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || ""],
      ),
    );
    const cont = new Map<string, { aprovadas: number; pendentes: number }>();
    for (const i of (insc ?? []) as Array<{ turma_id: string; status: string }>) {
      const c = cont.get(i.turma_id) ?? { aprovadas: 0, pendentes: 0 };
      if (i.status === "aprovada") c.aprovadas++;
      if (i.status === "pendente") c.pendentes++;
      cont.set(i.turma_id, c);
    }
    return {
      podeEditar: adm,
      turmas: ((turmas ?? []) as Array<Record<string, unknown>>).map((t) => ({
        id: t.id as string,
        nome: t.nome as string,
        produto: (t.products as { nome?: string } | null)?.nome ?? null,
        formato: (t.formato as string | null) ?? null,
        inicio: (t.inicio as string | null) ?? null,
        fim: (t.fim as string | null) ?? null,
        horario: (t.horario as string | null) ?? null,
        vagas: (t.vagas as number | null) ?? null,
        trainer: nome.get(t.trainer_id as string) ?? null,
        trainerId: (t.trainer_id as string | null) ?? null,
        local: (t.local as string | null) ?? null,
        status: t.status as string,
        ...(cont.get(t.id as string) ?? { aprovadas: 0, pendentes: 0 }),
      })),
    };
  });

export const salvarTurma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(2).max(160),
        product_id: z.string().uuid().nullable(),
        formato: z.enum(["online", "presencial", "hibrido"]).nullable(),
        inicio: z.string().date().nullable(),
        fim: z.string().date().nullable(),
        horario: opc(80),
        vagas: z.number().int().min(1).max(1000).nullable(),
        trainer_id: z.string().uuid().nullable(),
        local: opc(300),
        link_acesso: z.string().trim().url().max(500).nullable().optional(),
        kickoff_em: z.string().datetime().nullable().optional(),
        status: z.enum(["aberta", "confirmada", "em_andamento", "encerrada", "cancelada"]),
        observacoes: opc(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId))) throw new Error("Quem monta turma é o ADM");
    const { id, ...campos } = data;
    const { data: antes } = id
      ? await db.from("turmas").select("trainer_id").eq("id", id).maybeSingle()
      : { data: null };
    const { data: salva, error } = id
      ? await db.from("turmas").update(campos).eq("id", id).select("id").single()
      : await db
          .from("turmas")
          .insert({ ...campos, created_by: context.userId })
          .select("id")
          .single();
    if (error) throw new Error(error.message);
    const turmaId = (salva as { id: string }).id;
    if (
      data.trainer_id &&
      data.trainer_id !== (antes as { trainer_id?: string } | null)?.trainer_id
    )
      await notificar(db, context.userId, {
        para: [data.trainer_id],
        tipo: "turma",
        titulo: `Você foi escalada para a turma ${data.nome}`,
        corpo: data.inicio ? `Início ${data.inicio.split("-").reverse().join("/")}` : null,
        link: `/turma/${turmaId}`,
      });
    return { id: turmaId };
  });

export const getTurma = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: t, error }, { data: insc }, adm] = await Promise.all([
      db.from("turmas").select("*").eq("id", data.id).maybeSingle(),
      db
        .from("turma_inscricoes")
        .select(
          "id, participante_nome, participante_email, participante_telefone, status, motivo, checkin_em, deal_id, created_at, companies:company_id(nome)",
        )
        .eq("turma_id", data.id)
        .order("created_at"),
      podeFaturar(db, context.userId),
    ]);
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Turma não encontrada");
    const turma = t as Record<string, string | number | null>;
    return {
      turma,
      inscricoes: ((insc ?? []) as Array<Record<string, unknown>>).map((i) => ({
        id: i.id as string,
        participante_nome: i.participante_nome as string,
        participante_email: (i.participante_email as string | null) ?? null,
        participante_telefone: (i.participante_telefone as string | null) ?? null,
        status: i.status as string,
        motivo: (i.motivo as string | null) ?? null,
        checkin_em: (i.checkin_em as string | null) ?? null,
        deal_id: (i.deal_id as string | null) ?? null,
        empresa: (i.companies as { nome?: string } | null)?.nome ?? null,
      })),
      podeEditar: adm,
      souTrainer: turma.trainer_id === context.userId,
    };
  });

export const inscreverNaTurma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        turmaId: z.string().uuid(),
        dealId: z.string().uuid().nullable(),
        participantes: z
          .array(
            z.object({
              nome: z.string().trim().min(2).max(160),
              email: z.string().trim().email().max(200).nullable(),
              telefone: z.string().trim().max(40).nullable(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: deal } = data.dealId
      ? await db.from("deals").select("company_id").eq("id", data.dealId).maybeSingle()
      : { data: null };
    const { error } = await db.from("turma_inscricoes").insert(
      data.participantes.map((p) => ({
        turma_id: data.turmaId,
        deal_id: data.dealId,
        company_id: (deal as { company_id: string | null } | null)?.company_id ?? null,
        participante_nome: p.nome,
        participante_email: p.email,
        participante_telefone: p.telefone,
        created_by: context.userId,
      })),
    );
    if (error) {
      if (error.code === "23505") throw new Error("Algum desses e-mails já está inscrito na turma");
      throw new Error(error.message);
    }
    await notificarFaturamento(db, {
      tipo: "turma",
      titulo: `${data.participantes.length} inscrição(ões) para aprovar`,
      link: `/turma/${data.turmaId}`,
      dealId: data.dealId,
    });
    return { ok: true };
  });

export const decidirInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["aprovada", "recusada", "cancelada", "pendente"]),
        motivo: opc(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId))) throw new Error("Só o ADM aprova inscrição");
    const { error } = await db
      .from("turma_inscricoes")
      .update({
        status: data.status,
        motivo: data.motivo ?? null,
        aprovado_por: data.status === "aprovada" ? context.userId : null,
        aprovado_em: data.status === "aprovada" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkinInscricao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), presente: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await solto(context.supabase).rpc("turma_checkin", {
      _inscricao: data.id,
      _presente: data.presente,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
