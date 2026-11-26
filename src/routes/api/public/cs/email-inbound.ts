import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe e-mails redirecionados da caixa do time de CS.
 * O serviço de encaminhamento (Zapier/Make/CloudMailin/Resend inbound) chama:
 *   POST /api/public/cs/email-inbound?token=<token do CS>
 * com JSON ou campos de formulário (from_email, from_name, to, cc, subject,
 * text, html, message_id, date, mailbox). Para caixas de webmail (ex.: CipNet),
 * a caixa redireciona para um mailhook do Make, que repassa para cá com
 * "mailbox" fixo da pessoa.
 */
export const Route = createFileRoute("/api/public/cs/email-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          url.searchParams.get("token") ?? request.headers.get("x-cs-inbound-token") ?? "";
        const { getInboundToken, storeInboundEmail } = await import("@/lib/cs/integrations.server");
        const expected = await getInboundToken(false);
        if (!expected || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        /*
         * JSON (Zapier, scripts) ou campos de formulário (mailhook do Make:
         * montar JSON lá quebra com aspas e quebras de linha do texto).
         */
        let body: Record<string, unknown>;
        const tipo = request.headers.get("content-type") ?? "";
        try {
          if (tipo.includes("form")) {
            const form = await request.formData();
            body = {};
            for (const [k, v] of form.entries()) if (typeof v === "string") body[k] = v;
          } else {
            body = (await request.json()) as Record<string, unknown>;
          }
        } catch {
          return new Response("Corpo inválido (JSON ou formulário)", { status: 400 });
        }

        const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : null);
        const arr = (k: string): string[] => {
          const v = body[k];
          if (Array.isArray(v)) return v.map(String);
          if (typeof v === "string")
            return v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          return [];
        };

        try {
          const result = await storeInboundEmail({
            messageId: str("message_id") ?? str("messageId"),
            from: str("from_email") ?? str("from"),
            fromName: str("from_name"),
            to: arr("to").length ? arr("to") : arr("to_email"),
            cc: arr("cc"),
            subject: str("subject"),
            text: str("text") ?? str("body_text") ?? str("plain"),
            html: str("html") ?? str("body_html"),
            receivedAt: str("received_at") ?? str("date"),
            mailbox: str("mailbox") ?? str("envelope_to"),
          });
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "erro";
          console.error("[cs email inbound]", message);
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
