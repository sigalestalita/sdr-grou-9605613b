import { createFileRoute } from "@tanstack/react-router";

// GIF transparente de 1x1.
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) =>
  c.charCodeAt(0),
);

/** Imagem de 1px no e-mail: registra a abertura. */
export const Route = createFileRoute("/api/public/email/abrir/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { registrarAbertura } = await import("@/lib/email-marketing/rastreio.server");
          await registrarAbertura(params.token.replace(/\.gif$/, ""));
        } catch {
          // a imagem sai mesmo se o registro falhar
        }
        return new Response(GIF, {
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
          },
        });
      },
    },
  },
});
