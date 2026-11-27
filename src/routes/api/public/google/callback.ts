import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Volta da autorização do Google Agenda. Confere o estado (que diz de quem é
 * o pedido), troca o código pelo token e devolve a pessoa para a tela de onde
 * ela saiu, com ?google=ok ou ?google=erro.
 */
export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const estado = url.searchParams.get("state");
        const negado = url.searchParams.get("error");
        const { configGoogle, concluirAutorizacao } = await import("@/lib/google/agenda.server");
        const base = configGoogle().base;
        const volta = (caminho: string, resultado: string, msg?: string) =>
          Response.redirect(
            `${base}${caminho}?google=${resultado}${msg ? `&msg=${encodeURIComponent(msg.slice(0, 200))}` : ""}`,
            302,
          );
        if (negado) return volta("/cs-integracoes", "erro", "Autorização cancelada no Google");
        if (!code || !estado)
          return volta("/cs-integracoes", "erro", "Resposta incompleta do Google");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const r = await concluirAutorizacao(
            supabaseAdmin as unknown as SupabaseClient,
            code,
            estado,
          );
          return volta(r.voltarPara, "ok");
        } catch (e) {
          return volta("/cs-integracoes", "erro", e instanceof Error ? e.message : String(e));
        }
      },
    },
  },
});
