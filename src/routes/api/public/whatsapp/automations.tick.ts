import { createFileRoute } from "@tanstack/react-router";

/** Motor de automações do WhatsApp (novo lead, sem resposta, mudança de etapa, lembrete). Chamado pelo pg_cron a cada 2 min. */
export const Route = createFileRoute("/api/public/whatsapp/automations/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Mesmo token dos hooks públicos (Integrações CS).
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        const { runAutomationsTick } = await import("@/lib/whatsapp/automations-engine.server");
        try {
          const result = await runAutomationsTick();
          // Jornada da agenda: lembretes entre o agendamento e a reunião.
          const { processarJornadaDaAgenda } = await import("@/lib/sdr/jornada-agenda.server");
          const jornada = await processarJornadaDaAgenda().catch((e: unknown) => ({
            erro: e instanceof Error ? e.message : String(e),
          }));
          return Response.json({ ok: true, ...result, jornada });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha";
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
