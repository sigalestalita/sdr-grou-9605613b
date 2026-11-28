import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * "Conectar Google Agenda" (escrita): status, iniciar a autorização e
 * desconectar. Cada pessoa conecta a própria conta; o token nunca sai do
 * servidor.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export const statusGoogleAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/google/agenda.server");
    const cfg = g.configGoogle();
    const conta = await g.googleConectado(await admin(), context.userId);
    return {
      configurado: cfg.pronto,
      redirectUri: cfg.redirectUri,
      conectado: !!conta,
      email: conta?.email ?? null,
      conectadoEm: conta?.conectado_em ?? null,
      erro: conta?.ultimo_erro ?? null,
    };
  });

export const conectarGoogleAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        voltarPara: z
          .string()
          .regex(/^\/[A-Za-z0-9/_-]*$/)
          .max(120)
          .default("/cs-integracoes"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/google/agenda.server");
    const { data: perfil } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    const url = await g.iniciarAutorizacao(
      await admin(),
      context.userId,
      (perfil as { email?: string | null } | null)?.email ?? null,
      data.voltarPara,
    );
    return { url };
  });

export const desconectarGoogleAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/google/agenda.server");
    await g.desconectarGoogle(await admin(), context.userId);
    return { ok: true };
  });

/** Delegação do Google Workspace (agenda do time inteiro): só o que não é secreto. */
export const statusDelegacaoGoogle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: gestor } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!gestor) return null;
    const { statusDaDelegacao } = await import("@/lib/google/delegacao.server");
    return statusDaDelegacao();
  });
