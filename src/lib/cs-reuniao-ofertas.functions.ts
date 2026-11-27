import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { horariosDisponiveis, MAX_HORARIOS, validarHorarios } from "@/lib/cs/oferta-horarios";
import { PUBLIC_SITE_URL } from "@/lib/propostas/site";

/*
 * Oferecer 2+ horários ao cliente para ele escolher depois.
 *
 * Cada horário é uma reunião com status "reservada" (oferta_id preenchido):
 * assim ela já aparece na Agenda do CS e na ficha, e o horário fica ocupado.
 * Quando o cliente escolhe pelo link (/reuniao/<token>) — ou o CS marca o
 * escolhido —, aquela vira "agendada" e as outras são apagadas.
 */
type Row = Record<string, unknown>;
const solto = (s: unknown) => s as SupabaseClient;
export const linkDaOferta = (token: string) => `${PUBLIC_SITE_URL}/reuniao/${token}`;

const CriarSchema = z.object({
  clientUid: z.string().min(1),
  contactId: z.string().uuid().nullable(),
  title: z.string().trim().min(2).max(200),
  categoryId: z.string().uuid({ message: "Escolha o tipo da reunião" }),
  durationMinutes: z.number().int().min(5).max(600).default(60),
  meetingUrl: z.string().trim().max(500).nullable(),
  summary: z.string().trim().max(2000).nullable(),
  horarios: z.array(z.string().min(1)).min(2).max(MAX_HORARIOS),
});

export const criarOfertaDeHorarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CriarSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const v = validarHorarios(data.horarios, data.durationMinutes);
    if (!v.ok) throw new Error(v.erro);
    const { data: oferta, error } = await db
      .from("cs_reuniao_ofertas")
      .insert({
        client_uid: data.clientUid,
        contact_id: data.contactId,
        owner_user_id: context.userId,
        title: data.title,
        category_id: data.categoryId,
        duration_minutes: data.durationMinutes,
        meeting_url: data.meetingUrl,
        summary: data.summary,
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);
    const o = oferta as { id: string; token: string };
    const { error: e2 } = await db.from("cs_meetings").insert(
      v.horarios.map((inicio) => ({
        client_uid: data.clientUid,
        contact_id: data.contactId,
        title: data.title,
        category_id: data.categoryId,
        occurred_at: inicio,
        duration_minutes: data.durationMinutes,
        status: "reservada",
        meeting_url: data.meetingUrl,
        summary: data.summary,
        owner_user_id: context.userId,
        created_by: context.userId,
        source: "oferta",
        oferta_id: o.id,
      })),
    );
    if (e2) {
      await db.from("cs_reuniao_ofertas").delete().eq("id", o.id);
      throw new Error(e2.message);
    }
    return { id: o.id, link: linkDaOferta(o.token) };
  });

export type OfertaLista = {
  id: string;
  link: string;
  title: string;
  status: string;
  contatoNome: string | null;
  criadaEm: string;
  escolhidaEm: string | null;
  escolhidaPor: string | null;
  horarios: Array<{ id: string; inicio: string; status: string }>;
};

/** Ofertas do cliente (abertas primeiro), com os horários de cada uma. */
export const listarOfertasDoCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<OfertaLista[]> => {
    const db = solto(context.supabase);
    const { data: ofertas, error } = await db
      .from("cs_reuniao_ofertas")
      .select(
        "id, token, title, status, created_at, escolhida_em, escolhida_por, escolhida_meeting_id, cs_contacts:contact_id(nome)",
      )
      .eq("client_uid", data.clientUid)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    const lista = (ofertas ?? []) as Row[];
    if (!lista.length) return [];
    const { data: reunioes } = await db
      .from("cs_meetings")
      .select("id, occurred_at, status, oferta_id")
      .in(
        "oferta_id",
        lista.map((o) => String(o.id)),
      )
      .order("occurred_at");
    const porOferta = new Map<string, Array<{ id: string; inicio: string; status: string }>>();
    for (const r of (reunioes ?? []) as Row[]) {
      const k = String(r.oferta_id);
      porOferta.set(k, [
        ...(porOferta.get(k) ?? []),
        { id: String(r.id), inicio: String(r.occurred_at), status: String(r.status) },
      ]);
    }
    return lista
      .map((o) => ({
        id: String(o.id),
        link: linkDaOferta(String(o.token)),
        title: String(o.title),
        status: String(o.status),
        contatoNome: (o.cs_contacts as { nome?: string } | null)?.nome ?? null,
        criadaEm: String(o.created_at),
        escolhidaEm: (o.escolhida_em as string | null) ?? null,
        escolhidaPor: (o.escolhida_por as string | null) ?? null,
        horarios: porOferta.get(String(o.id)) ?? [],
      }))
      .sort((a, b) => Number(b.status === "aberta") - Number(a.status === "aberta"));
  });

/**
 * Fecha a oferta no horário escolhido: ele vira "agendada", os outros somem e
 * a reunião entra na linha do tempo do cliente. Usado pelo CS (com o acesso
 * dele) e pela página do cliente (service role, sempre pelo token).
 */
async function fecharNaEscolha(
  db: SupabaseClient,
  oferta: {
    id: string;
    client_uid: string;
    owner_user_id: string;
    title: string;
    summary: string | null;
    category_id: string | null;
  },
  meetingId: string,
  por: "cliente" | "cs",
  nome: string | null,
  autorId: string,
) {
  const { data: alvo } = await db
    .from("cs_meetings")
    .select("id, occurred_at, status")
    .eq("id", meetingId)
    .eq("oferta_id", oferta.id)
    .maybeSingle();
  const r = alvo as { id: string; occurred_at: string; status: string } | null;
  if (!r || r.status !== "reservada") throw new Error("Esse horário não está mais disponível");
  const { error } = await db
    .from("cs_meetings")
    .update({ status: "agendada", updated_at: new Date().toISOString() })
    .eq("id", r.id);
  if (error) throw new Error(error.message);
  await db
    .from("cs_meetings")
    .delete()
    .eq("oferta_id", oferta.id)
    .eq("status", "reservada")
    .neq("id", r.id);
  await db
    .from("cs_reuniao_ofertas")
    .update({
      status: "escolhida",
      escolhida_meeting_id: r.id,
      escolhida_em: new Date().toISOString(),
      escolhida_por: por,
      escolhida_nome: nome,
    })
    .eq("id", oferta.id);
  await db.from("cs_timeline_events").insert({
    client_uid: oferta.client_uid,
    author_id: autorId,
    event_type: "reuniao",
    channel: "reuniao",
    title: oferta.title,
    description:
      por === "cliente"
        ? `Horário escolhido pelo cliente${nome ? ` (${nome})` : ""} pelo link.`
        : oferta.summary,
    occurred_at: r.occurred_at,
    metadata: { meeting_id: r.id, status: "agendada", category_id: oferta.category_id },
  });
  return r;
}

/**
 * Avisa (sino + e-mail) quem ofereceu, o CS responsável e o executivo do
 * cliente que o horário foi escolhido. Quem confirmou na mão não se avisa.
 */
async function avisarEscolha(
  oferta: { client_uid: string; owner_user_id: string; title: string },
  inicio: string,
  quem: string,
  excluir: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = solto(supabaseAdmin);
  const { data: c } = await db
    .from("cs_clients")
    .select("nome_empresa, cs_responsavel_id, comercial_responsavel_id")
    .eq("client_uid", oferta.client_uid)
    .maybeSingle();
  const cli = c as {
    nome_empresa?: string | null;
    cs_responsavel_id?: string | null;
    comercial_responsavel_id?: string | null;
  } | null;
  const para = [
    ...new Set(
      [oferta.owner_user_id, cli?.cs_responsavel_id, cli?.comercial_responsavel_id].filter(
        (u): u is string => !!u && u !== excluir,
      ),
    ),
  ];
  if (!para.length) return;
  const quando = new Date(inicio).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const empresa = cli?.nome_empresa ?? "Cliente";
  const titulo = `${empresa} confirmou a reunião: ${quando}`;
  const corpo = `${oferta.title}\n${quem}\nA reunião já está na Agenda do CS e na ficha do cliente; os outros horários oferecidos foram liberados.`;
  const link = `/empresas/${oferta.client_uid}`;
  await db
    .from("notificacoes")
    .insert(para.map((user_id) => ({ user_id, tipo: "mencao", titulo, corpo, link })));
  const { enviarMencaoPorEmail } = await import("@/lib/notificacoes-email.server");
  await enviarMencaoPorEmail({
    para,
    titulo,
    corpo,
    link,
    rodape: "Aviso de reunião confirmada no Compass",
  }).catch((e) => console.warn("[oferta] e-mail", e));
}

/** Convite de calendário (.ics) para o contato do cliente e quem ofereceu. */
async function mandarConvite(meetingId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enviarConviteDaReuniaoCs } = await import("@/lib/cs/convite-reuniao.server");
    return await enviarConviteDaReuniaoCs(solto(supabaseAdmin), meetingId);
  } catch (e) {
    console.warn("[oferta] convite", e);
    return { enviado: false, para: [] as string[], motivo: "falha no envio" };
  }
}

const COLS_OFERTA = "id, token, client_uid, owner_user_id, title, summary, category_id, status";

/** O CS marca o horário que o cliente escolheu (resposta por WhatsApp, e-mail…). */
export const escolherHorarioDaOferta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ ofertaId: z.string().uuid(), meetingId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: o } = await db
      .from("cs_reuniao_ofertas")
      .select(COLS_OFERTA)
      .eq("id", data.ofertaId)
      .maybeSingle();
    const oferta = o as (Row & { status: string }) | null;
    if (!oferta) throw new Error("Oferta não encontrada");
    if (oferta.status !== "aberta") throw new Error("Essa oferta já foi fechada");
    const r = await fecharNaEscolha(
      db,
      oferta as never,
      data.meetingId,
      "cs",
      null,
      context.userId,
    );
    await avisarEscolha(
      oferta as never,
      r.occurred_at,
      "Confirmado pelo CS (resposta do cliente fora do link).",
      context.userId,
    ).catch((e) => console.warn("[oferta] aviso", e));
    const convite = await mandarConvite(r.id);
    return { ok: true, convite };
  });

/** Cancela a oferta: os horários reservados voltam a ficar livres. */
export const cancelarOfertaDeHorarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ofertaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { error } = await db
      .from("cs_reuniao_ofertas")
      .update({ status: "cancelada" })
      .eq("id", data.ofertaId)
      .eq("status", "aberta");
    if (error) throw new Error(error.message);
    await db.from("cs_meetings").delete().eq("oferta_id", data.ofertaId).eq("status", "reservada");
    return { ok: true };
  });

// ------------------------------------------------------------ página pública
const TokenZ = z.object({
  token: z
    .string()
    .min(16)
    .max(64)
    .regex(/^[A-Za-z0-9]+$/),
});

async function ofertaPorToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = solto(supabaseAdmin);
  const { data } = await db
    .from("cs_reuniao_ofertas")
    .select(`${COLS_OFERTA}, duration_minutes, escolhida_meeting_id`)
    .eq("token", token)
    .maybeSingle();
  return { db, oferta: data as (Row & { id: string; status: string }) | null };
}

/** O que o cliente vê no link: empresa, quem convida, duração e os horários. */
export const verOfertaPublica = createServerFn({ method: "POST" })
  .inputValidator((d) => TokenZ.parse(d))
  .handler(async ({ data }) => {
    const { db, oferta } = await ofertaPorToken(data.token);
    if (!oferta) return { encontrada: false as const };
    const [{ data: cliente }, { data: dono }, { data: reunioes }] = await Promise.all([
      db
        .from("cs_clients")
        .select("nome_empresa")
        .eq("client_uid", oferta.client_uid)
        .maybeSingle(),
      db.from("profiles").select("full_name").eq("id", oferta.owner_user_id).maybeSingle(),
      db
        .from("cs_meetings")
        .select("id, occurred_at, status")
        .eq("oferta_id", oferta.id)
        .order("occurred_at"),
    ]);
    const lista = ((reunioes ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      inicio: String(r.occurred_at),
      status: String(r.status),
    }));
    const escolhida = lista.find((r) => r.id === oferta.escolhida_meeting_id) ?? null;
    return {
      encontrada: true as const,
      status: oferta.status,
      titulo: String(oferta.title),
      empresa: (cliente as { nome_empresa?: string } | null)?.nome_empresa ?? null,
      quemConvida: (dono as { full_name?: string } | null)?.full_name ?? "Grou",
      duracao: (oferta.duration_minutes as number | null) ?? null,
      horarios: horariosDisponiveis(lista.filter((r) => r.status === "reservada")).map((r) => ({
        id: r.id,
        inicio: r.inicio,
      })),
      escolhida: escolhida ? { inicio: escolhida.inicio } : null,
    };
  });

/** O cliente escolhe um horário pelo link. */
export const escolherHorarioPublico = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    TokenZ.extend({
      meetingId: z.string().uuid(),
      nome: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db, oferta } = await ofertaPorToken(data.token);
    if (!oferta) throw new Error("Link inválido");
    if (oferta.status !== "aberta") throw new Error("Esse convite já foi respondido ou cancelado");
    const r = await fecharNaEscolha(
      db,
      oferta as never,
      data.meetingId,
      "cliente",
      data.nome?.trim() || null,
      String(oferta.owner_user_id),
    );
    // Aqui não há usuário logado: o aviso vai pelo service role.
    await avisarEscolha(
      oferta as never,
      r.occurred_at,
      data.nome?.trim()
        ? `Escolhido pelo cliente: ${data.nome.trim()}.`
        : "Escolhido pelo cliente pelo link.",
      null,
    ).catch((e) => console.warn("[oferta] aviso", e));
    const convite = await mandarConvite(r.id);
    // Diz ao cliente só se o convite foi mesmo para o e-mail dele.
    return { ok: true, inicio: r.occurred_at, conviteParaVoce: !!convite.paraContato };
  });
