import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ajustarVencimento, somarDias, type Ausencia } from "@/lib/cs/agenda-tarefas";

/*
 * Agenda de tarefas do CS (Configurações CS → Agenda de tarefas): dias,
 * horário e atendimentos por dia do time e por pessoa, feriados e ausências.
 * Ler é de todos (o kanban usa); salvar e lançar ausência é da gestão.
 */
const solto = (s: unknown) => s as SupabaseClient;

async function exigirGestao(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc("is_manager", { _user_id: userId });
  if (!data) throw new Error("Só a gestão configura a agenda de tarefas");
}

export const lerAgendaTarefas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { carregarAgenda } = await import("@/lib/cs/agenda-tarefas.server");
    const db = solto(context.supabase);
    const { config, ausencias } = await carregarAgenda(db);
    const { data: extras } = await db
      .from("cs_ausencias")
      .select("id, substituto_id, observacao, criado_em")
      .in(
        "id",
        ausencias.map((a) => a.id),
      );
    const porId = new Map(
      (
        (extras ?? []) as Array<{
          id: string;
          substituto_id: string | null;
          observacao: string | null;
        }>
      ).map((e) => [e.id, e]),
    );
    return {
      config,
      ausencias: ausencias.map((a) => ({
        ...a,
        substitutoId: porId.get(a.id)?.substituto_id ?? null,
        observacao: porId.get(a.id)?.observacao ?? null,
      })),
    };
  });

const ConfigZ = z.object({
  dias: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  inicio: z.string().regex(/^\d{2}:\d{2}$/),
  fim: z.string().regex(/^\d{2}:\d{2}$/),
  atendimentos_por_dia: z.number().int().min(1).max(50),
  feriados: z
    .array(
      z.object({
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nome: z.string().trim().min(1).max(80),
      }),
    )
    .max(200),
  por_pessoa: z.record(
    z.string().uuid(),
    z.object({
      dias: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      atendimentos_por_dia: z.number().int().min(1).max(50).optional(),
    }),
  ),
});

export const salvarAgendaTarefas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ config: ConfigZ }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigirGestao(db, context.userId);
    const { CHAVE_AGENDA } = await import("@/lib/cs/agenda-tarefas.server");
    const config = {
      ...data.config,
      feriados: [...data.config.feriados].sort((a, b) => a.data.localeCompare(b.data)),
    };
    const { error } = await db
      .from("cs_settings")
      .upsert({ key: CHAVE_AGENDA, value: config, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Lança uma ausência. Com substituto, ele passa a ver a carteira no período
 * (delegação). As tarefas da pessoa que caem no período são remarcadas para a
 * volta ou passadas ao substituto; os cards de cadência pendentes do período
 * saem da semana (a cadência põe o cliente de novo na próxima semana
 * disponível) ou vão para o substituto.
 */
export const salvarAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        motivo: z.string().trim().min(1).max(60),
        substitutoId: z.string().uuid().nullable(),
        observacao: z.string().trim().max(300).nullable(),
        tarefas: z.enum(["remarcar", "substituto", "manter"]),
      })
      .refine((d) => d.fim >= d.inicio, "A data final é antes da inicial")
      .refine((d) => d.substitutoId !== d.userId, "O substituto precisa ser outra pessoa")
      .refine((d) => d.tarefas !== "substituto" || !!d.substitutoId, "Escolha o substituto")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigirGestao(db, context.userId);
    const { data: nova, error } = await db
      .from("cs_ausencias")
      .insert({
        user_id: data.userId,
        inicio: data.inicio,
        fim: data.fim,
        motivo: data.motivo,
        substituto_id: data.substitutoId,
        observacao: data.observacao,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.substitutoId) {
      await db.from("cs_delegations").insert({
        from_user_id: data.userId,
        to_user_id: data.substitutoId,
        starts_at: data.inicio,
        ends_at: data.fim,
        reason: `${data.motivo} (agenda de tarefas)`,
        created_by: context.userId,
      });
    }

    // Período em UTC cobrindo os dias em Brasília.
    const de = new Date(`${data.inicio}T03:00:00Z`).toISOString();
    const ate = new Date(`${somarDias(data.fim, 1)}T03:00:00Z`).toISOString();
    let tarefas = 0;
    let cards = 0;
    if (data.tarefas !== "manter") {
      const { carregarAgenda } = await import("@/lib/cs/agenda-tarefas.server");
      const { config, ausencias } = await carregarAgenda(db);
      const { data: pend } = await db
        .from("cs_tasks")
        .select("id, due_at")
        .eq("owner_id", data.userId)
        .eq("status", "pendente")
        .gte("due_at", de)
        .lt("due_at", ate);
      for (const t of (pend ?? []) as Array<{ id: string; due_at: string }>) {
        const patch =
          data.tarefas === "substituto"
            ? { owner_id: data.substitutoId }
            : {
                due_at: ajustarVencimento(t.due_at, data.userId, config, ausencias as Ausencia[])
                  .iso,
              };
        const { error: e } = await db.from("cs_tasks").update(patch).eq("id", t.id);
        if (!e) tarefas++;
      }
      // Cards de cadência pendentes nos dias da ausência.
      const { data: semana } = await db
        .from("cs_cadence_tasks")
        .select("id, week_start, weekday")
        .eq("owner_id", data.userId)
        .eq("done", false)
        .gte("week_start", somarDias(data.inicio, -6))
        .lte("week_start", data.fim);
      const doPeriodo = (
        (semana ?? []) as Array<{ id: string; week_start: string; weekday: number }>
      ).filter((k) => {
        const dia = somarDias(k.week_start, Math.max(1, k.weekday) - 1);
        return dia >= data.inicio && dia <= data.fim;
      });
      if (doPeriodo.length) {
        const ids = doPeriodo.map((k) => k.id);
        const { error: e } =
          data.tarefas === "substituto"
            ? await db
                .from("cs_cadence_tasks")
                .update({ owner_id: data.substitutoId })
                .in("id", ids)
            : await db.from("cs_cadence_tasks").delete().in("id", ids);
        if (!e) cards = ids.length;
      }
    }
    return { id: (nova as { id: string }).id, tarefas, cards };
  });

export const removerAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    await exigirGestao(db, context.userId);
    const { data: a } = await db
      .from("cs_ausencias")
      .select("user_id, substituto_id, inicio, fim")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db.from("cs_ausencias").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    // A delegação criada junto sai também.
    const x = a as {
      user_id: string;
      substituto_id: string | null;
      inicio: string;
      fim: string;
    } | null;
    if (x?.substituto_id)
      await db
        .from("cs_delegations")
        .delete()
        .eq("from_user_id", x.user_id)
        .eq("to_user_id", x.substituto_id)
        .eq("starts_at", x.inicio)
        .eq("ends_at", x.fim);
    return { ok: true };
  });
