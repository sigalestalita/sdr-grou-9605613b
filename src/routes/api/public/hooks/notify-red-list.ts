import { createFileRoute } from "@tanstack/react-router";

/** Mensal: lista de clientes em vermelho há 6+ meses para diretoria e admin. */
export const Route = createFileRoute("/api/public/hooks/notify-red-list")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        const { sendRedListEmail } = await import("@/lib/cs/red-list.server");
        try {
          return Response.json({ ok: true, ...(await sendRedListEmail()) });
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
