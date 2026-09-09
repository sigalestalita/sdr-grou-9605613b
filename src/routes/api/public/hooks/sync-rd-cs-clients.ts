import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-rd-cs-clients")({
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
        const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
        const { syncRdClientsToCs } = await import("@/lib/cs/rd-clients.server");
        try {
          const result = await syncRdClientsToCs({ dryRun });

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
