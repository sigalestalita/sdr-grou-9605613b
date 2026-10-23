import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/*
 * Lead de lista de evento que acabou de responder vira card.
 *
 * A campanha com "lead só ao responder" cria o lead oculto e marcado. Na
 * primeira mensagem dele, ele aparece no kanban na etapa Novo; daí em diante o
 * webhook segue o caminho de sempre: a roleta escolhe a SDR, a resposta de
 * campanha avisa a SDR e deixa a IA de fora.
 */
export async function ativarLeadQueRespondeu(
  admin: SupabaseClient<Database>,
  leadId: string,
): Promise<boolean> {
  const { data: lead } = await admin
    .from("leads")
    .select("oculto_sdr, form_payload, stage_id, campaign")
    .eq("id", leadId)
    .maybeSingle();
  const fp = (lead?.form_payload ?? {}) as Record<string, unknown>;
  if (!lead?.oculto_sdr || fp.ativar_ao_responder !== true) return false;

  const { data: novo } = lead.stage_id
    ? { data: null }
    : await admin.from("stages").select("id").eq("slug", "novo").maybeSingle();
  const agora = new Date().toISOString();
  await admin
    .from("leads")
    .update({
      oculto_sdr: false,
      ...(novo?.id ? { stage_id: novo.id, stage_entered_at: agora } : {}),
      last_action_at: agora,
      form_payload: { ...fp, ativar_ao_responder: false, respondeu_em: agora },
    } as never)
    .eq("id", leadId);
  await admin.from("lead_interactions").insert({
    lead_id: leadId,
    author_id: null,
    type: "routing",
    content: `Respondeu ao disparo${lead.campaign ? ` "${lead.campaign}"` : ""} e entrou no kanban.`,
    metadata: { mode: "ativado_na_resposta", campanha_id: fp.campanha_id ?? null },
  } as never);
  return true;
}
