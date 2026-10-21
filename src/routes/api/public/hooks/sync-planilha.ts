import { createFileRoute } from "@tanstack/react-router";

/**
 * Traz para o kanban os leads novos da planilha (Meta Ads e orgânico).
 * Chamado pelo agendamento no banco a cada 2 minutos, para o lead entrar no
 * Pipeline sem depender de alguém estar com a tela aberta.
 */
export const Route = createFileRoute("/api/public/hooks/sync-planilha")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { sincronizarPlanilha } = await import("@/lib/sheets-sync.server");
          return Response.json({ ok: true, ...(await sincronizarPlanilha(supabaseAdmin)) });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
