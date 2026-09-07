import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-rd-cs-clients")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
