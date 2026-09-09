import { createFileRoute } from "@tanstack/react-router";

/**
 * Espelho do RD em fatias (cabe no limite do worker).
 * POST /api/public/hooks/mirror-rd?token=…
 *   body { resource: "organizations"|"contacts", order?, direction?, q?, from?, to? }
 *   body { resource: "deals", next?, pages? }
 *   body { counts: true }  → contagem atual do staging
 */
export const Route = createFileRoute("/api/public/hooks/mirror-rd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          /* vazio */
        }
        const { mirrorSlice, mirrorCounts } = await import("@/lib/rd/rd-mirror.server");
        try {
          if (body.counts) return Response.json({ ok: true, counts: await mirrorCounts() });
          const result = await mirrorSlice(body as never);
          return Response.json({ ok: true, ...result });
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
