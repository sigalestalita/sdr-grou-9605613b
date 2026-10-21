import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de Lead Ads do Meta: cada formulário enviado vira lead no kanban.
 * GET é a verificação do cadastro no Meta; POST traz os avisos de lead.
 */
export const Route = createFileRoute("/api/public/meta/leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { configMetaLeads } = await import("@/lib/meta-leads.server");
        const { verifyToken } = configMetaLeads();
        if (
          verifyToken &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === verifyToken
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const { configMetaLeads, assinaturaValida, avisosDoWebhook, receberLeadDoMeta } =
          await import("@/lib/meta-leads.server");
        const { appSecret } = configMetaLeads();
        if (
          !appSecret ||
          !assinaturaValida(raw, request.headers.get("x-hub-signature-256"), appSecret)
        )
          return new Response("invalid signature", { status: 401 });
        let corpo: unknown;
        try {
          corpo = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const resultados = [];
        for (const aviso of avisosDoWebhook(corpo)) resultados.push(await receberLeadDoMeta(aviso));
        // Algum lead que não entrou: 500 faz o Meta reenviar o aviso mais tarde.
        const falhou = resultados.some((r) => !r.ok);
        return Response.json({ ok: !falhou, resultados }, { status: falhou ? 500 : 200 });
      },
    },
  },
});
