import { createFileRoute } from "@tanstack/react-router";

/** Link do e-mail: registra o clique e leva ao destino. */
export const Route = createFileRoute("/api/public/email/clique/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const destino = new URL(request.url).searchParams.get("u") ?? "";
        // Só http(s): nada de javascript: ou outros esquemas.
        if (!/^https?:\/\//i.test(destino)) return new Response("Link inválido", { status: 400 });
        try {
          const { registrarClique } = await import("@/lib/email-marketing/rastreio.server");
          await registrarClique(params.token);
        } catch {
          // o redirecionamento acontece mesmo se o registro falhar
        }
        return Response.redirect(destino, 302);
      },
    },
  },
});
