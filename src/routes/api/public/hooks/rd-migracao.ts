import { createFileRoute } from "@tanstack/react-router";

/**
 * Migração do RD conduzida de fora do navegador (mesmo token dos demais hooks
 * do CS). Cada chamada é uma fatia curta, como as da tela Migração do RD:
 *   { acao: "contagens" }                                   → staging rd_*
 *   { acao: "espelho", resource, order?, direction?, q?, from?, to? }
 *   { acao: "espelho", resource: "deals", next?, pages? }
 *   { acao: "historico", fase: "activities" | "tasks", pagina, paginas?, concluidas? }
 *   { acao: "marketing", linhas: [...] }   → base de marketing (até 500 por vez)
 * A transformação já tem o hook transform-rd (offset/limit).
 */
export const Route = createFileRoute("/api/public/hooks/rd-migracao")({
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
          return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
        }
        try {
          if (body.acao === "contagens") {
            const { mirrorCounts } = await import("@/lib/rd/rd-mirror.server");
            return Response.json({ ok: true, counts: await mirrorCounts() });
          }
          if (body.acao === "espelho") {
            const { mirrorSlice } = await import("@/lib/rd/rd-mirror.server");
            const { acao: _a, ...slice } = body;
            return Response.json({ ok: true, ...(await mirrorSlice(slice as never)) });
          }
          if (body.acao === "historico") {
            const { importarPaginasDoHistoricoRd } = await import("@/lib/rd/historico.server");
            const fase = body.fase === "tasks" ? "tasks" : "activities";
            const pagina = Math.max(1, Math.min(1000, Number(body.pagina) || 1));
            const paginas = Math.max(1, Math.min(10, Number(body.paginas) || 5));
            const concluidas =
              body.concluidas === "true" || body.concluidas === "false"
                ? body.concluidas
                : undefined;
            return Response.json({
              ok: true,
              ...(await importarPaginasDoHistoricoRd({ fase, pagina, paginas, concluidas })),
            });
          }
          if (body.acao === "marketing") {
            const { z } = await import("zod");
            const { LinhaSchema } = await import("@/lib/rd-marketing.functions");
            const linhas = z.array(LinhaSchema).min(1).max(500).parse(body.linhas);
            const { importarLeadsDeMarketing } = await import("@/lib/rd/marketing.server");
            return Response.json({ ok: true, ...(await importarLeadsDeMarketing(linhas)) });
          }
          return Response.json({ ok: false, error: "acao desconhecida" }, { status: 400 });
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
