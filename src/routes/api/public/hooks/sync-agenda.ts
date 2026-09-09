import { createFileRoute } from "@tanstack/react-router";

/** Sincroniza Calendly + Google Agenda do time e liquida reuniões terminadas. */
export const Route = createFileRoute("/api/public/hooks/sync-agenda")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken, syncAgendas } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json({ ok: true, ...(await syncAgendas(null)) });
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
