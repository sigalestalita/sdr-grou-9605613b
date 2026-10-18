import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Caixa de notificações de cada pessoa (o sino do topo) e a lista de pessoas
 * para mencionar.
 */
const solto = (s: unknown) => s as SupabaseClient;

export type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida_em: string | null;
  created_at: string;
};

export const listarNotificacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data, error }, { count }] = await Promise.all([
      db
        .from("notificacoes")
        .select("id, tipo, titulo, corpo, link, lida_em, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("lida_em", null),
    ]);
    // Migration ainda não aplicada: sino vazio em vez de erro na tela toda.
    if (error) return { itens: [] as Notificacao[], naoLidas: 0 };
    return { itens: (data ?? []) as Notificacao[], naoLidas: count ?? 0 };
  });

export const marcarNotificacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid().optional(), todas: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let q = db
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("lida_em", null);
    if (!data.todas) {
      if (!data.id) return { ok: true };
      q = q.eq("id", data.id);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pessoas que podem ser mencionadas (perfis da equipe). */
export const listarPessoas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    return ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
      .filter((p) => p.id !== context.userId)
      .map((p) => ({ id: p.id, nome: p.full_name || p.email || p.id }));
  });
