import { createFileRoute } from "@tanstack/react-router";

/**
 * Dispara as campanhas de WhatsApp agendadas cujo horário chegou.
 * Chamado pelo agendamento no banco a cada minuto.
 */
export const Route = createFileRoute("/api/public/hooks/campanhas-agendadas")({
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
          const { dispararCampanhasAgendadas } =
            await import("@/lib/whatsapp/campanhas-agendadas.server");
          return Response.json({ ok: true, ...(await dispararCampanhasAgendadas()) });
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
