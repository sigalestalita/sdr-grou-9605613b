import { createFileRoute } from "@tanstack/react-router";

/** Diário: agenda os marcos das Jornadas Reais e, no modo automático, envia os do dia. */
export const Route = createFileRoute("/api/public/hooks/send-journey-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        const { processJourneyEmails } = await import("@/lib/cs/journey.server");
        try {
          return Response.json({ ok: true, ...(await processJourneyEmails()) });
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
