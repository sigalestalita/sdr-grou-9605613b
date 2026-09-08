import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-rd-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
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
