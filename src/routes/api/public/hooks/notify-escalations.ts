import { createFileRoute } from "@tanstack/react-router";

/** Recalcula as escalações e avisa a gestão por e-mail (uma vez por dia por ação). */
export const Route = createFileRoute("/api/public/hooks/notify-escalations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        const { notifyEscalationsByEmail } = await import("@/lib/cs/escalations.server");
        try {
          return Response.json({ ok: true, ...(await notifyEscalationsByEmail()) });
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
