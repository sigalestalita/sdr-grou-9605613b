import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { destinoDoFunilRd } from "./funis";

/*
 * Releitura diária dos funis comerciais do RD.
 *
 * A API do RD não filtra negócios por data de alteração, então mudanças feitas
 * no RD em negócios que já estão no Compass (etapa, dono, status, valor) só
 * chegam relendo tudo. Uma vez por dia:
 *   1. espelho: copia todos os negócios do RD para o staging (rd_deals), em
 *      fatias de algumas páginas (cursor next_page);
 *   2. transformar: atualiza os negócios comerciais do Compass em lotes,
 *      pulando campos marcados como 'manual' (mudados por alguém no Compass —
 *      trigger deals_marca_edicao_manual), sem reabrir negócio fechado aqui e
 *      sem regravar itens.
 * Na primeira vez, antes do espelho novo, a fase "marcar" compara o Compass
 * com o espelho antigo (o da migração) e marca como 'manual' o que divergir:
 * são as edições feitas aqui desde então.
 *
 * Cada chamada (pg_cron) faz um passo e guarda onde parou em
 * app_settings.rd_releitura. Um passo em andamento bloqueia outro.
 */
const CHAVE = "rd_releitura";
const LOTE = 1500;
const PAGINAS_POR_PASSO = 10;

type Fase = "marcar" | "espelho" | "transformar" | "pronto";
type Estado = {
  fase: Fase;
  dia: string;
  next?: string | null;
  offset?: number;
  rodandoDesde?: string | null;
  iniciadoEm?: string;
  totais?: { espelhados: number; atualizados: number; marcados: number; erros: number };
  ultimoErro?: string | null;
};

const hojeBrt = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function lerEstado(): Promise<Estado | null> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", CHAVE)
    .maybeSingle();
  return ((data as { value?: Estado } | null)?.value ?? null) as Estado | null;
}

async function salvarEstado(e: Estado) {
  await supabaseAdmin
    .from("app_settings")
    .upsert({ key: CHAVE, value: e as never, updated_at: new Date().toISOString() } as never, {
      onConflict: "key",
    });
}

/** rd_id dos negócios comerciais do staging, em ordem estável. */
async function idsComerciais(): Promise<string[]> {
  const out: string[] = [];
  for (let de = 0; de < 200000; de += 1000) {
    const { data, error } = await supabaseAdmin
      .from("rd_deals")
      .select("rd_id, pipeline")
      .order("rd_id")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ rd_id: string; pipeline: string | null }>;
    for (const r of rows) if (destinoDoFunilRd(r.pipeline).tipo === "negocio") out.push(r.rd_id);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function passoDaReleitura(): Promise<{ fase: Fase | "ocupado"; detalhe: string }> {
  const hoje = hojeBrt();
  let e: Estado = (await lerEstado()) ?? {
    fase: "marcar",
    dia: hoje,
    offset: 0,
    iniciadoEm: new Date().toISOString(),
  };
  if (e.rodandoDesde && Date.now() - Date.parse(e.rodandoDesde) < 10 * 60_000)
    return { fase: "ocupado", detalhe: `passo em andamento desde ${e.rodandoDesde}` };

  if (e.fase === "pronto") {
    if (e.dia === hoje) return { fase: "pronto", detalhe: `releitura de ${hoje} concluída` };
    e = {
      fase: "espelho",
      dia: hoje,
      next: null,
      offset: 0,
      iniciadoEm: new Date().toISOString(),
      totais: { espelhados: 0, atualizados: 0, marcados: 0, erros: 0 },
    };
  }
  e.totais ??= { espelhados: 0, atualizados: 0, marcados: 0, erros: 0 };
  e.rodandoDesde = new Date().toISOString();
  await salvarEstado(e);

  let detalhe = "";
  try {
    if (e.fase === "espelho") {
      const { mirrorSlice } = await import("./rd-mirror.server");
      const r = await mirrorSlice({
        resource: "deals",
        next: e.next ?? null,
        pages: PAGINAS_POR_PASSO,
      });
      e.totais.espelhados += r.saved;
      e.next = r.nextPage ?? null;
      detalhe = `espelho: +${r.saved} (total ${e.totais.espelhados})`;
      if (!r.hasMore) {
        e.fase = "transformar";
        e.offset = 0;
      }
    } else {
      // marcar ou transformar: um lote de negócios comerciais do staging
      const ids = await idsComerciais();
      const de = e.offset ?? 0;
      const lote = ids.slice(de, de + LOTE);
      if (lote.length === 0) {
        if (e.fase === "marcar") {
          e.fase = "espelho";
          e.next = null;
          detalhe = `marcação inicial concluída (${e.totais.marcados} negócios com edições do Compass)`;
        } else {
          e.fase = "pronto";
          detalhe = `releitura concluída: ${e.totais.atualizados} negócios atualizados`;
          await supabaseAdmin.from("integration_logs").insert({
            provider: "rd_station",
            action: "releitura_diaria",
            status: e.totais.erros ? "partial" : "ok",
            detail: { dia: e.dia, iniciadoEm: e.iniciadoEm, ...e.totais } as never,
          });
        }
        e.offset = 0;
      } else {
        const { transformRdToObjects } = await import("./rd-transform.server");
        const marcar = e.fase === "marcar";
        const r = await transformRdToObjects({
          only: ["deals"],
          filtro: { deals: lote },
          ...(marcar ? { marcarEdicoes: true } : { releitura: true }),
        });
        if (marcar) e.totais.marcados += r.deals.updated;
        else e.totais.atualizados += r.deals.updated + r.deals.created;
        e.totais.erros += r.errors.length;
        if (r.errors.length) e.ultimoErro = r.errors[0];
        e.offset = de + lote.length;
        detalhe = `${e.fase}: ${de + lote.length}/${ids.length}`;
      }
    }
    e.rodandoDesde = null;
    await salvarEstado(e);
    return { fase: e.fase, detalhe };
  } catch (err) {
    e.rodandoDesde = null;
    e.ultimoErro = err instanceof Error ? err.message : String(err);
    e.totais.erros += 1;
    await salvarEstado(e);
    throw err;
  }
}
