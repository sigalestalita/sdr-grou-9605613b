import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ajustarVencimento,
  lerConfigAgenda,
  type Ausencia,
  type ConfigAgenda,
} from "@/lib/cs/agenda-tarefas";

/*
 * Leitura da agenda de tarefas do CS no servidor (cs_settings
 * 'agenda_tarefas' + cs_ausencias) e ajuste da data das tarefas para o
 * próximo dia disponível do dono.
 */
const solto = (s: unknown) => s as SupabaseClient;

export const CHAVE_AGENDA = "agenda_tarefas";

export async function carregarAgenda(
  db: unknown,
  opts: { desde?: string } = {},
): Promise<{ config: ConfigAgenda; ausencias: Array<Ausencia & { id: string }> }> {
  const d = solto(db);
  const desde = opts.desde ?? new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const [{ data: cfg }, { data: aus }] = await Promise.all([
    d.from("cs_settings").select("value").eq("key", CHAVE_AGENDA).maybeSingle(),
    d
      .from("cs_ausencias")
      .select("id, user_id, inicio, fim, motivo")
      .gte("fim", desde)
      .order("inicio"),
  ]);
  return {
    config: lerConfigAgenda((cfg as { value?: unknown } | null)?.value),
    ausencias: (
      (aus ?? []) as Array<{
        id: string;
        user_id: string;
        inicio: string;
        fim: string;
        motivo: string | null;
      }>
    ).map((a) => ({ id: a.id, userId: a.user_id, inicio: a.inicio, fim: a.fim, motivo: a.motivo })),
  };
}

/**
 * Data da tarefa ajustada para o dono: feriado, dia que não trabalha ou
 * ausência levam para o próximo dia disponível. Nunca lança erro (sem agenda,
 * fica como veio).
 */
export async function ajustarDataDaTarefa(
  db: unknown,
  ownerId: string | null | undefined,
  iso: string,
): Promise<{ iso: string; movida: boolean; motivo: string | null }> {
  try {
    const { config, ausencias } = await carregarAgenda(db);
    return ajustarVencimento(iso, ownerId, config, ausencias);
  } catch {
    return { iso, movida: false, motivo: null };
  }
}
