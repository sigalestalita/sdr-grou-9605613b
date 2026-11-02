import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Quem pode receber reunião marcada pela SDR.
 *
 * O papel "executivo" vale para todo o comercial (pipeline, comissão,
 * carteira), e nem todos recebem agenda nova. A lista de quem recebe fica em
 * app_settings (sdr_agenda_executivos); sem lista, vale o papel, como antes.
 */
export const CHAVE_EXECUTIVOS_DA_AGENDA = "sdr_agenda_executivos";

export async function executivosDaAgenda(supabase: unknown): Promise<string[]> {
  const db = supabase as SupabaseClient;
  const [{ data: cfg }, { data: roles }] = await Promise.all([
    db.from("app_settings").select("value").eq("key", CHAVE_EXECUTIVOS_DA_AGENDA).maybeSingle(),
    db.from("user_roles").select("user_id").eq("role", "executivo"),
  ]);
  const doPapel = ((roles ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  return filtrarExecutivosDaAgenda(doPapel, (cfg?.value as { ids?: unknown } | null)?.ids);
}

/** A parte testável: a lista configurada, se houver, dentro de quem tem o papel. */
export function filtrarExecutivosDaAgenda(doPapel: string[], configurados: unknown): string[] {
  const ids = Array.isArray(configurados)
    ? configurados.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return doPapel;
  const papel = new Set(doPapel);
  return ids.filter((id) => papel.has(id));
}
