import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rdmGet } from "./marketing-api.server";

/*
 * Histórico completo dos leads vindo da API do RD Marketing, em duas etapas
 * que o script de migração chama em fatias (cada chamada cabe no limite de
 * tempo do servidor):
 *   1. ligarUuids: percorre uma segmentação (a de todos os contatos) e grava
 *      o uuid do RD em cada lead do Compass com o mesmo e-mail.
 *   2. importarEventos: para os leads com uuid e sem histórico buscado, traz
 *      todas as conversões e oportunidades e grava em lead_conversoes.
 */
const db = () => supabaseAdmin as unknown as SupabaseClient;

type Segmentacao = { id: number | string; name: string };

export async function listarSegmentacoes() {
  const r = await rdmGet<{ segmentations?: Segmentacao[] }>(
    "/platform/segmentations?page=1&page_size=125",
  );
  return (r?.segmentations ?? []).map((s) => ({ id: String(s.id), nome: s.name }));
}

type ContatoDaSegmentacao = { uuid: string; email?: string | null; name?: string | null };

export async function ligarUuids(opts: { segmentacaoId: string; pagina: number; paginas: number }) {
  let lidos = 0;
  let ligados = 0;
  let pagina = opts.pagina;
  let acabou = false;
  for (let i = 0; i < opts.paginas; i++, pagina++) {
    const r = await rdmGet<{ contacts?: ContatoDaSegmentacao[] }>(
      `/platform/segmentations/${encodeURIComponent(opts.segmentacaoId)}/contacts?page=${pagina}&page_size=125&order=created_at`,
    );
    const contatos = (r?.contacts ?? []).filter((c) => c.uuid && c.email);
    lidos += r?.contacts?.length ?? 0;
    if (!r?.contacts?.length) {
      acabou = true;
      break;
    }
    const porEmail = new Map(contatos.map((c) => [String(c.email).toLowerCase().trim(), c.uuid]));
    const emails = [...porEmail.keys()];
    const variantes = [...new Set(emails.concat(contatos.map((c) => String(c.email).trim())))];
    const { data: leads } = await db()
      .from("leads")
      .select("id, email, rd_marketing_id")
      .in("email", variantes);
    const atualizar = (
      (leads ?? []) as Array<{
        id: string;
        email: string;
        rd_marketing_id: string | null;
      }>
    )
      .map((l) => ({
        id: l.id,
        uuid: porEmail.get(l.email.toLowerCase().trim()),
        atual: l.rd_marketing_id,
      }))
      .filter((l) => l.uuid && l.uuid !== l.atual);
    for (let k = 0; k < atualizar.length; k += 25) {
      await Promise.all(
        atualizar
          .slice(k, k + 25)
          .map((l) => db().from("leads").update({ rd_marketing_id: l.uuid }).eq("id", l.id)),
      );
    }
    ligados += atualizar.length;
    if ((r?.contacts?.length ?? 0) < 125) {
      acabou = true;
      pagina++;
      break;
    }
  }
  return { lidos, ligados, proximaPagina: pagina, acabou };
}

type EventoRd = {
  event_type?: string;
  event_family?: string;
  event_identifier?: string;
  event_timestamp?: string;
  payload?: Record<string, unknown>;
  traffic_source?: unknown;
};

async function eventosDo(uuid: string, tipo: "CONVERSION" | "OPPORTUNITY") {
  const r = await rdmGet<EventoRd[] | { events?: EventoRd[] }>(
    `/platform/contacts/${encodeURIComponent(uuid)}/events?event_type=${tipo}`,
  );
  if (!r) return [];
  return Array.isArray(r) ? r : (r.events ?? []);
}

export async function importarEventos(opts: { limite: number }) {
  const { data: pendentes } = await db()
    .from("leads")
    .select("id, rd_marketing_id")
    .not("rd_marketing_id", "is", null)
    .is("rd_mkt_historico_em", null)
    .limit(opts.limite);
  const lista = (pendentes ?? []) as Array<{ id: string; rd_marketing_id: string }>;
  let conversoes = 0;
  let oportunidades = 0;
  const erros: string[] = [];
  for (let i = 0; i < lista.length; i += 4) {
    await Promise.all(
      lista.slice(i, i + 4).map(async (l) => {
        try {
          const [conv, opp] = await Promise.all([
            eventosDo(l.rd_marketing_id, "CONVERSION"),
            eventosDo(l.rd_marketing_id, "OPPORTUNITY"),
          ]);
          const linhas = [...conv, ...opp]
            .filter((e) => e.event_timestamp)
            .map((e) => {
              const opor = e.event_type === "OPPORTUNITY";
              return {
                lead_id: l.id,
                nome: opor
                  ? "Marcado como oportunidade"
                  : String(e.event_identifier ?? "Conversão").slice(0, 300),
                origem: "rd_marketing_api",
                canal: opor ? "oportunidade" : null,
                ocorrida_em: e.event_timestamp,
                payload: { event_type: e.event_type, traffic_source: e.traffic_source ?? null },
              };
            });
          if (linhas.length) {
            // A API traz tudo: a última conversão que veio do CSV sai para não duplicar.
            await db()
              .from("lead_conversoes")
              .delete()
              .eq("lead_id", l.id)
              .eq("origem", "rd_marketing");
            const { error } = await db()
              .from("lead_conversoes")
              .upsert(linhas, { onConflict: "lead_id,nome,ocorrida_em", ignoreDuplicates: true });
            if (error) throw new Error(error.message);
          }
          conversoes += conv.length;
          oportunidades += opp.length;
          await db()
            .from("leads")
            .update({ rd_mkt_historico_em: new Date().toISOString() })
            .eq("id", l.id);
        } catch (e) {
          erros.push(`${l.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
        }
      }),
    );
  }
  const { count } = await db()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("rd_marketing_id", "is", null)
    .is("rd_mkt_historico_em", null);
  return {
    processados: lista.length,
    conversoes,
    oportunidades,
    faltam: count ?? null,
    erros: erros.slice(0, 5),
  };
}
