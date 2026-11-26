import { createFileRoute } from "@tanstack/react-router";

/**
 * Recalcula o health score da carteira ativa inteira. Chamado todo dia pelo
 * agendamento no banco, depois do sync da sinaleira, com o mesmo token dele.
 */
export const Route = createFileRoute("/api/public/hooks/recalcular-saude")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recomputeHealthAll } = await import("@/lib/cs/cs-core.server");
        const inicio = Date.now();
        try {
          const r = await recomputeHealthAll(supabaseAdmin);
          await supabaseAdmin.from("integration_logs").insert({
            provider: "cs_health",
            action: "recalcular_carteira",
            status: r.erros ? "partial" : "success",
            detail: { ...r, ms: Date.now() - inicio } as never,
          });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("integration_logs").insert({
            provider: "cs_health",
            action: "recalcular_carteira",
            status: "error",
            detail: { erro: erro.slice(0, 500) } as never,
          });
          return Response.json({ ok: false, erro }, { status: 500 });
        }
      },
    },
  },
});
