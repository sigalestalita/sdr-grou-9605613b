import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Tickets do CS.
 *
 * O pedido do cliente chegava como mensagem solta no WhatsApp: sem estado, sem
 * dono e sem como saber o que ficou em aberto. O ticket dá as três coisas, e
 * nasce da própria conversa — não é um formulário à parte que alguém precisa
 * lembrar de preencher.
 */

export const STATUS_TICKET = [
  { valor: "aberto", rotulo: "Aberto", ajuda: "Chegou e ninguém pegou ainda" },
  { valor: "em_andamento", rotulo: "Em andamento", ajuda: "Alguém do time está resolvendo" },
  {
    valor: "aguardando_cliente",
    rotulo: "Aguardando cliente",
    ajuda: "A bola está com o cliente. Não conta contra o nosso tempo de resposta",
  },
  { valor: "resolvido", rotulo: "Resolvido", ajuda: "Terminou" },
  { valor: "cancelado", rotulo: "Cancelado", ajuda: "Não era um pedido, ou o cliente desistiu" },
] as const;

export const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/*
 * cs_tickets entra na migration deste módulo; os tipos gerados só a conhecem
 * depois que ela roda, então as consultas a ela passam por aqui.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSolto = { from: (t: string) => any };

export const listarTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.string().optional(),
        clientUid: z.string().optional(),
        meus: z.boolean().optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = (supabase as unknown as ClienteSolto)
      .from("cs_tickets")
      .select("*, cs_clients:client_uid(nome_empresa)")
      .order("created_at", { ascending: false })
      .limit(300);

    // Sem filtro, a fila esconde o que já terminou: é fila de trabalho.
    if (data?.status && data.status !== "todos") q = q.eq("status", data.status);
    else if (!data?.status) q = q.in("status", ["aberto", "em_andamento", "aguardando_cliente"]);
    if (data?.clientUid) q = q.eq("client_uid", data.clientUid);
    if (data?.meus) q = q.eq("responsavel_id", userId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: perfis } = await supabase.from("profiles").select("id, full_name, email");
    const nomeDe = new Map(
      (perfis ?? []).map((p) => [p.id as string, (p.full_name || p.email || p.id) as string]),
    );

    return {
      tickets: ((rows ?? []) as Array<Record<string, unknown>>).map((t) => ({
        id: t.id as string,
        numero: t.numero as number,
        clientUid: t.client_uid as string,
        empresa:
          (t.cs_clients as { nome_empresa?: string } | null)?.nome_empresa ??
          (t.client_uid as string),
        conversationId: (t.conversation_id as string | null) ?? null,
        canal: t.canal as string,
        titulo: t.titulo as string,
        descricao: (t.descricao as string | null) ?? null,
        status: t.status as string,
        prioridade: t.prioridade as string,
        categoria: (t.categoria as string | null) ?? null,
        responsavel: t.responsavel_id ? (nomeDe.get(t.responsavel_id as string) ?? null) : null,
        responsavelId: (t.responsavel_id as string | null) ?? null,
        abertoPelaIa: t.aberto_pela_ia === true,
        criadoEm: t.created_at as string,
        resolvidoEm: (t.resolvido_em as string | null) ?? null,
      })),
      pessoas: [...nomeDe].map(([id, nome]) => ({ id, nome })),
    };
  });

export const abrirTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        titulo: z.string().min(3).max(200),
        descricao: z.string().max(4000).nullable().optional(),
        prioridade: z.enum(PRIORIDADES).default("normal"),
        categoria: z.string().max(80).nullable().optional(),
        canal: z.enum(["whatsapp", "email", "reuniao", "telefone", "manual"]).default("manual"),
        conversationId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cliente } = await supabase
      .from("cs_clients")
      .select("cs_responsavel_id")
      .eq("client_uid", data.clientUid)
      .maybeSingle();

    const { data: novo, error } = await (supabase as unknown as ClienteSolto)
      .from("cs_tickets")
      .insert({
        client_uid: data.clientUid,
        titulo: data.titulo.trim(),
        descricao: data.descricao?.trim() || null,
        prioridade: data.prioridade,
        categoria: data.categoria?.trim() || null,
        canal: data.canal,
        conversation_id: data.conversationId ?? null,
        aberto_por: userId,
        // Já nasce com dono: ticket sem responsável é ticket que ninguém pega.
        responsavel_id:
          (cliente as { cs_responsavel_id?: string | null } | null)?.cs_responsavel_id ?? userId,
      })
      .select("id, numero")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "nota",
      channel: data.canal === "manual" ? null : data.canal,
      title: `Ticket #${(novo as { numero: number }).numero} aberto: ${data.titulo.trim()}`,
      description: data.descricao?.trim() || null,
      occurred_at: new Date().toISOString(),
    } as never);

    return {
      ok: true,
      id: (novo as { id: string }).id,
      numero: (novo as { numero: number }).numero,
    };
  });

export const atualizarTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum(["aberto", "em_andamento", "aguardando_cliente", "resolvido", "cancelado"])
          .optional(),
        prioridade: z.enum(PRIORIDADES).optional(),
        responsavelId: z.string().uuid().nullable().optional(),
        resolucao: z.string().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch.status = data.status;
      // Data de resolução acompanha o estado, senão o relatório mente.
      patch.resolvido_em =
        data.status === "resolvido" || data.status === "cancelado"
          ? new Date().toISOString()
          : null;
    }
    if (data.prioridade) patch.prioridade = data.prioridade;
    if (data.responsavelId !== undefined) patch.responsavel_id = data.responsavelId;
    if (data.resolucao !== undefined) patch.resolucao = data.resolucao?.trim() || null;

    const { error } = await (supabase as unknown as ClienteSolto)
      .from("cs_tickets")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Abre ticket a partir da conversa, em nome da IA.
 *
 * Existe separado de abrirTicket porque não há usuário: quem decidiu foi o
 * atendimento automático, e isso precisa ficar visível na métrica — ticket
 * aberto pela IA conta diferente de ticket aberto por gente.
 */
export async function abrirTicketPelaIa(input: {
  clientUid: string;
  conversationId: string;
  titulo: string;
  descricao: string | null;
  prioridade?: (typeof PRIORIDADES)[number];
}): Promise<{ numero: number } | null> {
  const admin = await db();
  const { data: cliente } = await admin
    .from("cs_clients")
    .select("cs_responsavel_id")
    .eq("client_uid", input.clientUid)
    .maybeSingle();

  const { data: novo, error } = await (admin as unknown as ClienteSolto)
    .from("cs_tickets")
    .insert({
      client_uid: input.clientUid,
      conversation_id: input.conversationId,
      canal: "whatsapp",
      titulo: input.titulo.slice(0, 200),
      descricao: input.descricao,
      prioridade: input.prioridade ?? "normal",
      aberto_pela_ia: true,
      responsavel_id:
        (cliente as { cs_responsavel_id?: string | null } | null)?.cs_responsavel_id ?? null,
    })
    .select("numero")
    .single();
  if (error) return null;
  return { numero: (novo as { numero: number }).numero };
}
