import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe cada ficha enviada no app de cadastro (fichacadastral.grougp.com.br).
 * O app manda a linha de client_registrations em JSON, com o segredo no
 * header x-compass-secret (app_settings.ficha_cadastral_webhook).
 */
export const Route = createFileRoute("/api/public/fichas/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receberFicha, segredoDoWebhook } = await import("@/lib/fichas/fichas.server");
        const esperado = await segredoDoWebhook();
        const recebido =
          request.headers.get("x-compass-secret") ??
          new URL(request.url).searchParams.get("secret") ??
          "";
        if (!esperado || recebido !== esperado)
          return new Response("Unauthorized", { status: 401 });
        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
        }
        try {
          return Response.json({ ok: true, ...(await receberFicha(corpo)) });
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
