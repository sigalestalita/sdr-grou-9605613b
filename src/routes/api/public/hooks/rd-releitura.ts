import { createFileRoute } from "@tanstack/react-router";

/**
 * Releitura diária dos funis comerciais do RD, um passo por chamada.
 * POST /api/public/hooks/rd-releitura?token=<token do CS>
 * Chamado pelo pg_cron a cada poucos minutos; fora de um ciclo, não faz nada.
 */
export const Route = createFileRoute("/api/public/hooks/rd-releitura")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        const { passoDaReleitura } = await import("@/lib/rd/rd-releitura.server");
        try {
          return Response.json({ ok: true, ...(await passoDaReleitura()) });
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
