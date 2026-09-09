import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { suggestFeatures, type FeatureOffer } from "@/lib/cs/features";

export type CsFeatureOffer = {
  id: string;
  featureId: string;
  featureName: string;
  status: "oferecida" | "adotada" | "recusada";
  offeredAt: string;
  note: string | null;
};

/** Funcionalidades a oferecer agora + histórico de ofertas da empresa. */
export const getCsFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { getFeaturesConfig, getMasterclassConfig } = await import("@/lib/cs/cs-core.server");
    const { weeksInColor, licenseStart } = await import("@/lib/cs/cadence");
    const { suggestMasterclasses } = await import("@/lib/cs/masterclass");
    const { lastNWeeks } = await import("@/lib/cs-types");
    const weeks = lastNWeeks(12);
    const [cfg, mcCfg, { data: client }, { data: snaps }, { data: offers }, { data: parts }] =
      await Promise.all([
        getFeaturesConfig(supabase),
        getMasterclassConfig(supabase),
        supabase
          .from("cs_clients")
          .select(
            "tag_uso, diagnostico_causa, data_inicio_contrato, data_renovacao, current_signal, pessoas_mapeadas",
          )
          .eq("client_uid", data.clientUid)
          .maybeSingle(),
        supabase
          .from("cs_signal_snapshots")
          .select("week_start, signal")
          .eq("client_uid", data.clientUid)
          .gte("week_start", weeks[0])
          .order("week_start"),
        supabase
          .from("cs_feature_offers")
          .select("id, feature_id, status, offered_at, note")
          .eq("client_uid", data.clientUid)
          .order("offered_at", { ascending: false }),
        supabase
          .from("cs_masterclass_participations")
          .select("module_id, held_at, used_in_project")
          .eq("client_uid", data.clientUid),
      ]);
    const history = weeks.map(
      (w) => ((snaps ?? []).find((s) => s.week_start === w)?.signal ?? "sem_dado") as never,
    );
    if (!(snaps ?? []).length && client?.current_signal)
      history[history.length - 1] = client.current_signal as never;
    const { color, weeks: wk } = weeksInColor(history);
    const start = licenseStart(client?.data_inicio_contrato, client?.data_renovacao);
    const licenseDays = start
      ? Math.floor((Date.now() - new Date(start).getTime()) / 86400000)
      : null;
    const mcDone = (parts ?? []).map((p) => p.module_id);
    const mcSuggested = suggestMasterclasses(
      {
        history,
        tagUso: client?.tag_uso,
        diagCause: client?.diagnostico_causa,
        contractStart: client?.data_inicio_contrato,
      },
      (parts ?? []) as never,
      mcCfg,
    ).map((s) => s.moduleId);
    const suggestions = suggestFeatures(
      {
        tagUso: client?.tag_uso,
        licenseDays,
        signal: color,
        weeksInColor: wk,
        pessoasMapeadas: client?.pessoas_mapeadas ?? null,
        modulos: [...mcDone, ...mcSuggested],
      },
      (offers ?? []) as FeatureOffer[],
      cfg,
    );
    const nameOf = (id: string) => cfg.funcionalidades.find((f) => f.id === id)?.nome ?? id;
    return {
      catalog: cfg.funcionalidades.map((f) => ({ id: f.id, nome: f.nome, resolve: f.resolve })),
      suggestions,
      offers: (offers ?? []).map(
        (o): CsFeatureOffer => ({
          id: o.id,
          featureId: o.feature_id,
          featureName: nameOf(o.feature_id),
          status: o.status as CsFeatureOffer["status"],
          offeredAt: o.offered_at,
          note: o.note,
        }),
      ),
      pessoasMapeadas: client?.pessoas_mapeadas ?? null,
    };
  });

export const saveCsFeatureOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientUid: z.string().min(1),
        featureId: z.string().min(1),
        status: z.enum(["oferecida", "adotada", "recusada"]),
        offeredAt: z.string().min(8),
        note: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      client_uid: data.clientUid,
      feature_id: data.featureId,
      status: data.status,
      offered_at: data.offeredAt.slice(0, 10),
      note: data.note?.trim() || null,
    };
    const { error } = data.id
      ? await supabase.from("cs_feature_offers").update(row).eq("id", data.id)
      : await supabase.from("cs_feature_offers").insert({ ...row, created_by: userId });
    if (error) throw new Error(error.message);
    if (!data.id) {
      const { getFeaturesConfig } = await import("@/lib/cs/cs-core.server");
      const cfg = await getFeaturesConfig(supabase);
      const nome = cfg.funcionalidades.find((f) => f.id === data.featureId)?.nome ?? data.featureId;
      await supabase.from("cs_timeline_events").insert({
        client_uid: data.clientUid,
        author_id: userId,
        event_type: "funcionalidade",
        channel: "observacao",
        title: `Funcionalidade ${data.status}: ${nome}`,
        description: row.note,
        occurred_at: new Date(`${row.offered_at}T12:00:00`).toISOString(),
        metadata: { feature_id: data.featureId, status: data.status },
      });
    }
    return { ok: true };
  });

export const deleteCsFeatureOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_feature_offers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
