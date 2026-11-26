import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Agendar reunião do CS com uma pessoa do cliente, pela ficha ou direto na
 * agenda, e ligar um evento da Google Agenda a uma empresa e a um contato.
 * A reunião agendada é uma linha de cs_meetings (status "agendada"): pode
 * haver quantas forem precisas no mesmo dia.
 */
const solto = (s: unknown) => s as SupabaseClient;

/** Clientes do CS pelo nome (para escolher na agenda). */
export const buscarClientesCs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const termo = data.q.replace(/[%_,()]/g, " ").trim();
    const { data: rows, error } = await solto(context.supabase)
      .from("cs_clients")
      .select("client_uid, nome_empresa, tipo_lead")
      .ilike("nome_empresa", `%${termo}%`)
      .eq("ativo", true)
      .order("nome_empresa")
      .limit(15);
    if (error) throw new Error(error.message);
    return (
      (rows ?? []) as Array<{ client_uid: string; nome_empresa: string; tipo_lead: string }>
    ).map((r) => ({ clientUid: r.client_uid, nome: r.nome_empresa, tipo: r.tipo_lead }));
  });

/** Contatos e tipos de reunião de um cliente (formulário de agendamento). */
export const opcoesDoClienteCs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: contatos }, { data: tipos }] = await Promise.all([
      db
        .from("cs_contacts")
        .select("id, nome, email, cargo, ativo_no_cliente")
        .eq("client_uid", data.clientUid)
        .order("nome"),
      db.from("cs_meeting_categories").select("id, name").eq("ativo", true).order("name"),
    ]);
    return {
      contatos: (
        (contatos ?? []) as Array<{
          id: string;
          nome: string;
          email: string | null;
          cargo: string | null;
          ativo_no_cliente: boolean;
        }>
      )
        .filter((c) => c.ativo_no_cliente !== false)
        .map((c) => ({ id: c.id, nome: c.nome, email: c.email, cargo: c.cargo })),
      tipos: (tipos ?? []) as Array<{ id: string; name: string }>,
    };
  });

/**
 * Liga (ou desliga) um evento da Google Agenda a uma empresa e a um contato.
 * Quem pode: o dono do evento ou a gestão (a leitura com RLS confere). A
 * escrita vai com o service role, porque a tabela só tem leitura para o app.
 */
export const vincularEventoDaAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        eventId: z.string().uuid(),
        clientUid: z.string().min(1).max(80).nullable(),
        contactId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: evento } = await db
      .from("cs_calendly_events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!evento) throw new Error("Evento não encontrado ou sem acesso");
    if (data.contactId) {
      const { data: contato } = await db
        .from("cs_contacts")
        .select("client_uid")
        .eq("id", data.contactId)
        .maybeSingle();
      if (!contato || (contato as { client_uid: string }).client_uid !== data.clientUid)
        throw new Error("O contato não é dessa empresa");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await solto(supabaseAdmin)
      .from("cs_calendly_events")
      .update({ client_uid: data.clientUid, contact_id: data.contactId })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
