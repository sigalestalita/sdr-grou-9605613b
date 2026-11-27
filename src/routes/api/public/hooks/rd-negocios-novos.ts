import { createFileRoute } from "@tanstack/react-router";

/**
 * Negócios comerciais criados no RD → Compass (só cria o que falta).
 * POST /api/public/hooks/rd-negocios-novos?token=<token do CS>
 * body: { desde?: ISO, dryRun?: boolean } — sem desde, últimos 3 dias.
 * Agendado pelo pg_cron; idempotente.
 */
export const Route = createFileRoute("/api/public/hooks/rd-negocios-novos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        let body: { desde?: string; dryRun?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          /* corpo vazio ok */
        }
        const desde =
          body.desde && !Number.isNaN(Date.parse(body.desde))
            ? new Date(body.desde).toISOString()
            : undefined;
        const { trazerNegociosNovosDoRd } = await import("@/lib/rd/rd-negocios-novos.server");
        try {
          const r = await trazerNegociosNovosDoRd({ desde, dryRun: !!body.dryRun });
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
