import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/public/integracao — o Sales Coach grava aqui a análise de cada reunião.
 * Authorization: Bearer compass_… (gerado em Configurações → Integração com o Sales Coach).
 * Corpo: { action, ... }; ver src/lib/integracao-sales-coach.server.ts.
 */
export const Route = createFileRoute("/api/public/integracao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const erro = (codigo: number, msg: string) =>
          Response.json({ error: msg, erro: msg }, { status: codigo });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { acaoSalesCoach, tokenValido, ErroIntegracao } =
          await import("@/lib/integracao-sales-coach.server");
        const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
        if (!(await tokenValido(db, request.headers.get("authorization") ?? "")))
          return erro(401, "Token inválido ou revogado");
        let body: Record<string, unknown> = {};
        try {
          const b = await request.json();
          if (b && typeof b === "object" && !Array.isArray(b)) body = b as Record<string, unknown>;
        } catch {
          return erro(400, "Corpo inválido");
        }
        try {
          return Response.json(await acaoSalesCoach(db, body));
        } catch (e) {
          const codigo = e instanceof ErroIntegracao ? e.codigo : 500;
          const msg = e instanceof Error ? e.message : String(e);
          if (codigo >= 500) console.error("[integracao sales coach]", msg);
          return erro(codigo, msg);
        }
      },
      GET: async () => Response.json({ error: "Use POST" }, { status: 405 }),
    },
  },
});
