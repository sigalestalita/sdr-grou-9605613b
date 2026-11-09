import { createFileRoute } from "@tanstack/react-router";

/** Fila das campanhas de e-mail: chamado a cada minuto pelo agendamento do banco. */
export const Route = createFileRoute("/api/public/hooks/email-campanhas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        try {
          const { processarFila } = await import("@/lib/email-marketing/envio.server");
          return Response.json({ ok: true, ...(await processarFila()) });
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
