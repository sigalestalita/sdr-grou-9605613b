import { createFileRoute } from "@tanstack/react-router";

/**
 * Lê o uso da Plataforma de CS e grava por empresa (cs_plataforma_uso). Chamado
 * todo dia às 08:10 pelo agendamento no banco, antes do recálculo da saúde
 * (08:20), com o mesmo token do sync da sinaleira.
 */
export const Route = createFileRoute("/api/public/hooks/sync-plataforma-cs")({
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
        const { sincronizarPlataformaCs } = await import("@/lib/cs/plataforma-cs.server");
        const inicio = Date.now();
        try {
          const r = await sincronizarPlataformaCs(supabaseAdmin as never);
          await supabaseAdmin.from("integration_logs").insert({
            provider: "plataforma_cs",
            action: "sync_uso",
            status: "success",
            detail: { ...r, ms: Date.now() - inicio } as never,
          });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("integration_logs").insert({
            provider: "plataforma_cs",
            action: "sync_uso",
            status: "error",
            detail: { erro: erro.slice(0, 500) } as never,
          });
          return Response.json({ ok: false, erro }, { status: 500 });
        }
      },
    },
  },
});
