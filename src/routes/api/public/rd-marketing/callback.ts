import { createFileRoute } from "@tanstack/react-router";

/**
 * Volta do RD Marketing depois que a pessoa autoriza o Compass. Troca o code
 * pelos tokens e manda de volta para a tela da migração.
 */
export const Route = createFileRoute("/api/public/rd-marketing/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const volta = new URL("/migracao-rd", url.origin);
        volta.searchParams.set("aba", "marketing");
        try {
          if (!code) throw new Error("O RD não devolveu a autorização");
          const { concluirConexao } = await import("@/lib/rd/marketing-api.server");
          await concluirConexao(code, state);
          volta.searchParams.set("rdm", "ok");
        } catch (e) {
          volta.searchParams.set("rdm", "erro");
          volta.searchParams.set("msg", (e instanceof Error ? e.message : String(e)).slice(0, 200));
        }
        return Response.redirect(volta.toString(), 302);
      },
    },
  },
});
