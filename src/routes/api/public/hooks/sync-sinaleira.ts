import { createFileRoute } from "@tanstack/react-router";

/**
 * Lê a planilha da sinaleira (aba mais recente, ou a aba pedida) e grava o
 * snapshot nas fichas de CS. Chamado todo dia pelo agendamento no banco, para
 * a sinaleira não depender de alguém clicar em "Sincronizar".
 * Corpo opcional: { tab?: string, weekStart?: "aaaa-mm-dd", createMissing?: boolean,
 *   inicio?: number, fim?: number } — inicio/fim limitam quais fichas são atualizadas.
 */
export const Route = createFileRoute("/api/public/hooks/sync-sinaleira")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) return new Response("Unauthorized", { status: 401 });
        let body: {
          tab?: unknown;
          weekStart?: unknown;
          createMissing?: unknown;
          inicio?: unknown;
          fim?: unknown;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // sem corpo: aba mais recente
        }
        const tab = typeof body.tab === "string" && body.tab.trim() ? body.tab.trim() : undefined;
        const weekStart =
          typeof body.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
            ? body.weekStart
            : undefined;
        const { syncSignalFromSheet } = await import("@/lib/cs/signal-sync.server");
        const r = await syncSignalFromSheet({
          tab,
          weekStart,
          createMissing: body.createMissing !== false,
          fatia:
            typeof body.inicio === "number" && typeof body.fim === "number"
              ? { inicio: body.inicio, fim: body.fim }
              : undefined,
        });
        return Response.json(r, { status: r.ok ? 200 : 500 });
      },
    },
  },
});
