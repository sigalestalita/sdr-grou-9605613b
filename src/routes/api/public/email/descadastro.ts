import { createFileRoute } from "@tanstack/react-router";

/**
 * Descadastro em um clique (cabeçalho List-Unsubscribe do e-mail: Gmail e
 * Outlook chamam por POST). GET leva à página de confirmação.
 */
export const Route = createFileRoute("/api/public/email/descadastro")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        const { descadastrar } = await import("@/lib/email-marketing/rastreio.server");
        const r = await descadastrar(t, "um clique (cliente de e-mail)");
        return new Response(r.ok ? "ok" : "token inválido", { status: r.ok ? 200 : 400 });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const t = url.searchParams.get("t") ?? "";
        return Response.redirect(
          new URL(`/descadastro?t=${encodeURIComponent(t)}`, url.origin).toString(),
          302,
        );
      },
    },
  },
});
