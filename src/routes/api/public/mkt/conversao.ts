import { createFileRoute } from "@tanstack/react-router";
import {
  JANELA_LIMITE_MIN,
  LIMITE_POR_IP,
  MAX_CORPO_BYTES,
  cabecalhosCors,
  caiuNoHoneypot,
  corpoDaConversao,
  origemPermitida,
} from "@/lib/mkt/conversao";

/*
 * Porta de entrada dos formulários do site da Grou (www.grougp.com).
 * Sem login: quem autentica é a chave pública do ativo, no corpo.
 */
export const Route = createFileRoute("/api/public/mkt/conversao")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!origemPermitida(origin)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
        return new Response(null, { status: 204, headers: cabecalhosCors(origin) });
      },
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const cors = cabecalhosCors(origin);
        const json = (corpo: unknown, status = 200) =>
          Response.json(corpo, { status, headers: cors });

        // Navegador de outro site: bloqueado. Sem Origin (servidor, curl) passa e depende da chave.
        if (origin && !origemPermitida(origin)) {
          return json({ ok: false, erro: "Origem não permitida." }, 403);
        }

        const texto = await request.text();
        if (new TextEncoder().encode(texto).length > MAX_CORPO_BYTES) {
          return json({ ok: false, erro: "Corpo grande demais." }, 413);
        }
        let bruto: unknown;
        try {
          bruto = JSON.parse(texto);
        } catch {
          return json({ ok: false, erro: "Envie o corpo em JSON." }, 400);
        }

        // Honeypot preenchido: robô. Responde como se tivesse dado certo e não grava nada.
        if (caiuNoHoneypot(bruto)) return json({ ok: true });

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          "desconhecido";
        const { dentroDoLimite, registrarConversaoDoSite } = await import(
          "@/lib/mkt/conversao.server"
        );
        if (!(await dentroDoLimite(ip, LIMITE_POR_IP, JANELA_LIMITE_MIN))) {
          return Response.json(
            { ok: false, erro: "Muitos envios. Tente de novo em alguns minutos." },
            { status: 429, headers: { ...cors, "Retry-After": String(JANELA_LIMITE_MIN * 60) } },
          );
        }

        const parsed = corpoDaConversao.safeParse(bruto);
        if (!parsed.success) {
          return json(
            {
              ok: false,
              erro: "Dados inválidos.",
              campos: parsed.error.issues.map((i) => ({
                campo: i.path.join(".") || "(corpo)",
                erro: i.message,
              })),
            },
            400,
          );
        }

        try {
          const r = await registrarConversaoDoSite(parsed.data, {
            ip: ip === "desconhecido" ? null : ip,
            userAgent: request.headers.get("user-agent"),
          });
          return json(r.corpo, r.status);
        } catch {
          return json({ ok: false, erro: "Não foi possível registrar agora. Tente de novo." }, 500);
        }
      },
    },
  },
});
