import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Volta do login da Conta Azul: confere o state e troca o código pelos tokens. */
export const Route = createFileRoute("/api/public/conta-azul/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return new Response("Faltou o código da Conta Azul", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as SupabaseClient;
        const { data } = await db
          .from("app_settings")
          .select("value")
          .eq("key", "contaazul_oauth_state")
          .maybeSingle();
        const salvo = (
          data as {
            value?: { state?: string; origin?: string; user_id?: string; expira?: string };
          } | null
        )?.value;
        if (
          !salvo?.state ||
          salvo.state !== state ||
          !salvo.expira ||
          new Date(salvo.expira) < new Date()
        )
          return new Response("Pedido de conexão expirado. Clique em Conectar de novo.", {
            status: 400,
          });
        try {
          const { trocarCodigo } = await import("@/lib/contaazul/api.server");
          await trocarCodigo(
            code,
            salvo.origin ?? `${url.protocol}//${url.host}`,
            salvo.user_id ?? null,
          );
          await db.from("app_settings").delete().eq("key", "contaazul_oauth_state");
          await db
            .from("integration_logs")
            .insert({ provider: "conta_azul", action: "oauth_connect", status: "ok", detail: {} });
          return new Response(null, {
            status: 302,
            headers: { Location: "/configuracoes?contaazul=conectada" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await db.from("integration_logs").insert({
            provider: "conta_azul",
            action: "oauth_connect",
            status: "error",
            detail: { erro: msg },
          });
          return new Response(`Falha ao conectar a Conta Azul: ${msg}`, { status: 502 });
        }
      },
    },
  },
});
