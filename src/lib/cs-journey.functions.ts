import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderJourneyBody } from "@/lib/cs/journey";

export type CsJourneyRow = {
  id: string;
  emailId: string;
  titulo: string;
  assunto: string;
  dia: number;
  dueAt: string;
  status: "agendado" | "pendente" | "enviado" | "pulado" | "expirado" | "erro";
  toEmail: string | null;
  toName: string | null;
  sentAt: string | null;
  error: string | null;
  preview: string;
};

/** Marcos da jornada de uma empresa (agenda o que falta antes de listar). */
export const getCsJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { scheduleJourneyEmails, getJourneyConfig } = await import("@/lib/cs/journey.server");
    await scheduleJourneyEmails(data.clientUid);
    const cfg = await getJourneyConfig();
    const { data: rows, error } = await supabase
      .from("cs_journey_emails")
      .select("*")
      .eq("client_uid", data.clientUid)
      .order("due_at");
    if (error) throw new Error(error.message);
    const items: CsJourneyRow[] = (rows ?? []).map((r) => {
      const tpl = cfg.emails.find((e) => e.id === r.email_id);
      return {
        id: r.id,
        emailId: r.email_id,
        titulo: tpl?.titulo ?? r.email_id,
        assunto: tpl?.assunto ?? r.subject ?? "",
        dia: tpl?.dia ?? 0,
        dueAt: r.due_at,
        status: r.status as CsJourneyRow["status"],
        toEmail: r.to_email,
        toName: r.to_name,
        sentAt: r.sent_at,
        error: r.error,
        preview: tpl ? renderJourneyBody(tpl.corpo, r.to_name, cfg.assinatura) : "",
      };
    });
    return { items, modo: cfg.modo };
  });

export const sendCsJourneyEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS garante que o usuário vê a empresa; o envio usa o serviço.
    const { data: row } = await context.supabase.from("cs_journey_emails").select("id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Marco não encontrado");
    const { sendJourneyEmail } = await import("@/lib/cs/journey.server");
    return sendJourneyEmail(data.id, context.userId);
  });

export const setCsJourneyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.enum(["pulado", "pendente"]), note: z.string().max(500).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cs_journey_emails")
      .update({ status: data.status, note: data.note ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Gestão: agenda/envia (modo automático) para todas as empresas agora. */
export const runCsJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão");
    const { processJourneyEmails } = await import("@/lib/cs/journey.server");
    return processJourneyEmails();
  });
