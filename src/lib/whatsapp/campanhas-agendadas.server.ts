import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executarCampanha } from "@/lib/whatsapp-campaigns.functions";

/**
 * Dispara as campanhas com status "scheduled" cujo horário já chegou.
 *
 * Cada campanha é "reservada" trocando o status para "sending" só se ainda
 * estiver "scheduled": duas rodadas seguidas não disparam a mesma campanha.
 * Template ainda não aprovado na Meta adia o disparo para a próxima rodada.
 */
/*
 * Quantas mensagens cada rodada manda. Cada envio leva alguns segundos, e a
 * rodada precisa terminar antes de a requisição cair; o resto fica para o
 * minuto seguinte.
 */
const LOTE_POR_RODADA = 25;

export async function dispararCampanhasAgendadas(agora = new Date()) {
  const { data: devidas, error } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id, name, created_by, whatsapp_templates:template_id(status, name)")
    .eq("status", "scheduled")
    .lte("scheduled_at", agora.toISOString());
  if (error) throw new Error(error.message);

  const resultados: Array<Record<string, unknown>> = [];
  for (const c of (devidas ?? []) as Array<{
    id: string;
    name: string;
    created_by: string | null;
    whatsapp_templates: { status: string | null; name: string } | null;
  }>) {
    if (c.whatsapp_templates?.status !== "approved") {
      resultados.push({ id: c.id, adiada: `template ${c.whatsapp_templates?.status ?? "?"}` });
      continue;
    }
    const { data: reservada } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "sending" })
      .eq("id", c.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!reservada) continue;
    try {
      const r = await executarCampanha(supabaseAdmin, c.id, LOTE_POR_RODADA, c.created_by);
      resultados.push({ id: c.id, ...r });
    } catch (e) {
      await supabaseAdmin.from("whatsapp_campaigns").update({ status: "failed" }).eq("id", c.id);
      resultados.push({ id: c.id, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { devidas: devidas?.length ?? 0, resultados };
}
