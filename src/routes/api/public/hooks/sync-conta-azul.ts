import { createFileRoute } from "@tanstack/react-router";

/**
 * Lê da Conta Azul o que mudou (vendas, notas de serviço, contas a receber).
 * Chamado pelo agendamento no banco a cada 15 minutos.
 */
export const Route = createFileRoute("/api/public/hooks/sync-conta-azul")({
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
          const { sincronizarContaAzul } = await import("@/lib/contaazul/sync.server");
          return Response.json(await sincronizarContaAzul());
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
