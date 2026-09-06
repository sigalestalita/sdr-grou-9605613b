import { createFileRoute } from "@tanstack/react-router";
import { getRdTokenInfo } from "@/lib/rd-token.server";

const RD_BASE = "https://crm.rdstation.com/api/v1";

// Rota temporária de descoberta da API do RD (Fase 1). Remover após a análise.
export const Route = createFileRoute("/api/public/rd/discover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") ?? "/organizations";
        const limit = url.searchParams.get("limit") ?? "3";
        const page = url.searchParams.get("page") ?? "1";
        const { token } = await getRdTokenInfo();
        if (!token) return Response.json({ error: "sem token" }, { status: 400 });
        const params = new URLSearchParams({ token, limit, page });
        const extra = url.searchParams.get("q");
        if (extra) for (const [k, v] of new URLSearchParams(extra)) params.set(k, v);
        const res = await fetch(`${RD_BASE}${path}?${params.toString()}`, {
          headers: { Accept: "application/json" },
        });
        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
