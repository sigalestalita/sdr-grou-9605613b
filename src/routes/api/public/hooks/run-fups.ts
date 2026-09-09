import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/run-fups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Token dos hooks públicos (Integrações CS). Sem ele o hook não roda.
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) {
          return Response.json(
            {
              ok: false,
              error: "Unauthorized: informe ?token= (Integrações CS → token dos hooks)",
            },
            { status: 401 },
          );
        }
        try {
          const { runFupsTick } = await import("@/lib/whatsapp/fups-engine.server");
          const { runAutomationsTick } = await import("@/lib/whatsapp/automations-engine.server");
          const [fups, autos] = await Promise.all([runFupsTick(), runAutomationsTick()]);
          return Response.json({ ok: true, fups, automations: autos });
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
