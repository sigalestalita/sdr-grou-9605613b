import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-rd-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Mesmo token dos demais hooks públicos — sem ele, qualquer um dispararia o sync.
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        const dryRun = url.searchParams.get("dryRun") === "1";
        const { syncRdEverything } = await import("@/lib/rd/rd-sync.server");
        try {
          const result = await syncRdEverything({ dryRun });
          return Response.json({ ok: true, ...result, pipelines: result.pipelines });
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
