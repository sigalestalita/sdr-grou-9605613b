import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe do Make o desempenho diário das campanhas da Meta
 * (`{diario: [...insights por anúncio], campanhas: [...]}`).
 */
export const Route = createFileRoute("/api/public/hooks/meta-ads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
        }
        try {
          const { gravarDesempenhoMeta } = await import("@/lib/meta-ads.server");
          return Response.json({ ok: true, ...(await gravarDesempenhoMeta(corpo as never)) });
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
