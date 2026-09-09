import { createFileRoute } from "@tanstack/react-router";

/**
 * Onda 2 — projeta o staging do RD em Empresas, Contatos e Negócios.
 * POST /api/public/hooks/transform-rd?token=<token do CS>   body: { dryRun?, only? }
 * Roda depois do sync-rd-all. Idempotente.
 */
export const Route = createFileRoute("/api/public/hooks/transform-rd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        let body: {
          dryRun?: boolean;
          only?: Array<"companies" | "contacts" | "deals" | "parents">;
          offset?: number;
          limit?: number;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* corpo vazio ok */
        }
        const { transformRdToObjects } = await import("@/lib/rd/rd-transform.server");
        try {
          const result = await transformRdToObjects({
            dryRun: !!body.dryRun,
            only: body.only,
            offset: body.offset,
            limit: body.limit,
          });
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
