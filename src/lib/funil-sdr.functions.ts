import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarPainel, type NegocioDoFunil } from "./funil-sdr";

const COLUNAS =
  "rd_id, name, pipeline, stage, status, owner_name, rd_created_at, closed_at:raw->>closed_at";

/**
 * Painel dos funis do SDR no período, lido do espelho do RD.
 *
 * O espelho é atualizado a cada 15 minutos (hook sync-rd), então o dia de
 * hoje já aparece — diferente do relatório do RD, processado de madrugada.
 */
export const getFunilSdr = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        funil: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ROUTING_TARGETS } = await import("./lead-routing.server");

    const { data: cfg } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "rd_pipeline")
      .maybeSingle();
    const funis = String(
      (cfg?.value as { name?: string } | null)?.name ??
        "Leads - Empresa [SDR]; Leads - Alianças Estratégicas [SDR]",
    )
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean);
    const escolhidos = data.funil && funis.includes(data.funil) ? [data.funil] : funis;

    /*
     * closed_at vem do RD como texto com fuso ("…T08:58:52-03:00"), então a
     * comparação no banco é de texto. Busca com um dia de folga de cada lado
     * e decide o período certo aqui, como data.
     */
    const umDia = 24 * 3600 * 1000;
    const folga = (iso: string, dias: number) =>
      new Date(new Date(iso).getTime() + dias * umDia).toISOString();
    async function ler(coluna: "rd_created_at" | "raw->>closed_at") {
      const texto = coluna !== "rd_created_at";
      const PAGE = 1000;
      const out: NegocioDoFunil[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: rows, error } = await supabaseAdmin
          .from("rd_deals")
          .select(COLUNAS)
          .in("pipeline", escolhidos)
          .gte(coluna, texto ? folga(data.from, -1) : data.from)
          .lte(coluna, texto ? folga(data.to, 1) : data.to)
          .order("rd_id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        out.push(...((rows ?? []) as unknown as NegocioDoFunil[]));
        if (!rows || rows.length < PAGE) break;
      }
      if (!texto) return out;
      const de = new Date(data.from).getTime();
      const ate = new Date(data.to).getTime();
      return out.filter((n) => {
        const t = n.closed_at ? new Date(n.closed_at).getTime() : NaN;
        return t >= de && t <= ate;
      });
    }

    const [criadas, fechadas, { data: ultimo }] = await Promise.all([
      ler("rd_created_at"),
      ler("raw->>closed_at"),
      supabaseAdmin
        .from("rd_deals")
        .select("synced_at")
        .in("pipeline", funis)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const sdrs = [
      ...ROUTING_TARGETS.roundRobin.map((t) => t.fullName),
      ROUTING_TARGETS.consultoria.fullName,
    ];
    return {
      funis,
      funil: escolhidos.length === 1 ? escolhidos[0] : null,
      atualizadoEm: (ultimo as { synced_at?: string } | null)?.synced_at ?? null,
      ...montarPainel(criadas, fechadas, sdrs),
    };
  });
