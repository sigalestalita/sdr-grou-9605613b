import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runRdSync, type SyncMode } from "@/lib/rd-station.functions";

export const Route = createFileRoute("/api/public/hooks/sync-rd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Token dos hooks públicos (Integrações CS). Sem ele o hook não roda.
        const __url = new URL(request.url);
        const __token =
          __url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken: __getTok } = await import("@/lib/cs/integrations.server");
        const __expected = await __getTok(false);
        if (!__expected || __token !== __expected) {
          return Response.json(
            {
              ok: false,
              error: "Unauthorized: informe ?token= (Integrações CS → token dos hooks)",
            },
            { status: 401 },
          );
        }
        let mode: SyncMode = "incremental";
        try {
          const body = (await request.json()) as { mode?: SyncMode };
          if (body?.mode === "full") mode = "full";
        } catch {
          /* empty body ok */
        }
        try {
          const result = await runRdSync(supabaseAdmin, mode);
          return Response.json({ ok: true, ...result });
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
