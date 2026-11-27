import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Tokens da integração com o Sales Coach (Configurações → Integração com o
 * Sales Coach). Só a gestão gera, vê e revoga. O token aparece uma vez; o banco
 * guarda só o hash.
 */
// sdr-grou.lovable.app redireciona para compass.grougp.com, e o fetch descarta o
// Authorization num redirecionamento entre domínios: o endereço é sempre este.
export const ENDERECO_INTEGRACAO = "https://compass.grougp.com/api/public/integracao";

async function exigirGestao(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc("is_manager", { _user_id: userId });
  if (!data) throw new Error("Só a gestão gerencia a integração com o Sales Coach");
}

export const tokensSalesCoach = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestao(context.supabase as unknown as SupabaseClient, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const [{ data, error }, { data: perfis }] = await Promise.all([
      db
        .from("integracao_tokens")
        .select("id, nome, prefixo, criado_por, criado_em, usado_em, revogado_em")
        .order("criado_em", { ascending: false }),
      db.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || "—"],
      ),
    );
    return (
      (data ?? []) as Array<{
        id: string;
        nome: string;
        prefixo: string;
        criado_por: string | null;
        criado_em: string;
        usado_em: string | null;
        revogado_em: string | null;
      }>
    ).map((t) => ({
      id: t.id,
      nome: t.nome,
      prefixo: t.prefixo,
      criadoPor: t.criado_por ? (nome.get(t.criado_por) ?? "—") : "—",
      criadoEm: t.criado_em,
      usadoEm: t.usado_em,
      revogadoEm: t.revogado_em,
    }));
  });

export const gerarTokenSalesCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ nome: z.string().trim().max(80).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await exigirGestao(context.supabase as unknown as SupabaseClient, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { novoToken, hashToken } = await import("@/lib/integracao-sales-coach.server");
    const token = novoToken();
    const { error } = await (supabaseAdmin as unknown as SupabaseClient)
      .from("integracao_tokens")
      .insert({
        nome: data.nome || "Sales Coach",
        prefixo: token.slice(0, 12),
        hash: hashToken(token),
        criado_por: context.userId,
      });
    if (error) throw new Error(error.message);
    return { token, endereco: ENDERECO_INTEGRACAO };
  });

export const revogarTokenSalesCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirGestao(context.supabase as unknown as SupabaseClient, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as SupabaseClient)
      .from("integracao_tokens")
      .update({ revogado_em: new Date().toISOString() })
      .eq("id", data.id)
      .is("revogado_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
