import { createFileRoute } from "@tanstack/react-router";

/**
 * Espelho dos funis do SDR (painel do dia), separado do sync de leads.
 * Corpo: { funil?: 0 | 1 | …, dias?: número } — um funil por chamada.
 */
export const Route = createFileRoute("/api/public/hooks/espelho-sdr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        let body: { funil?: unknown; dias?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // sem corpo: todos os funis
        }
        try {
          const { espelharFunisSdr } = await import("@/lib/rd/espelho-funis-sdr.server");
          const r = await espelharFunisSdr({
            funil: typeof body.funil === "number" ? body.funil : undefined,
            dias: typeof body.dias === "number" ? Math.max(1, Math.min(120, body.dias)) : undefined,
          });
          return Response.json({ ok: true, ...r });
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
