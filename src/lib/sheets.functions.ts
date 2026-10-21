import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeLeadType } from "./lead-type";
import {
  SPREADSHEET_ID,
  type LeadRow,
  fetchSheetRows,
  rowToLead,
  sincronizarPlanilha,
} from "./sheets-sync.server";

export const syncLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ limit: z.number().int().min(1).max(5000).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => sincronizarPlanilha(context.supabase, data));

export const getSheetSyncState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "sheets_sync_state")
      .maybeSingle();
    return {
      state: (data?.value ?? null) as null | {
        last_sync_at?: string;
        total_rows?: number;
        parsed?: number;
        inserted_total_run?: number;
        skipped_existing?: number;
      },
      updated_at: data?.updated_at ?? null,
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    };
  });

/** Backfill: lê a planilha e popula `demo_free` nos leads já importados. */
export const backfillDemoFreeFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isGestao } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "gestao",
    });
    const { data: isSuper } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isGestao && !isSuper) throw new Error("Forbidden");

    const sheetResult = await fetchSheetRows();
    if (!sheetResult.ok) {
      return { ok: false as const, error: sheetResult.message };
    }
    const parsed: Array<{ lead_id: string; demo_free: boolean }> = [];
    for (const item of sheetResult.rows) {
      const r = rowToLead(item.row, item.sheetIndex, item.rowIndex);
      if (!r) continue;
      if (r.payload.demo_free === null) continue;
      parsed.push({ lead_id: r.meta_lead_id, demo_free: r.payload.demo_free });
    }
    let updated = 0;
    for (const p of parsed) {
      const { data: rows, error } = await supabase
        .from("leads")
        .update({ demo_free: p.demo_free } as never)
        .filter("form_payload->>lead_id", "eq", p.lead_id)
        .select("id");
      if (!error && rows && rows.length > 0) updated += rows.length;
    }
    return { ok: true as const, scanned: parsed.length, updated };
  });
/*
 * Conferência: a planilha bate com o pipeline?
 *
 * A sincronização devolve "inserted" e "skipped", e o skipped junta duas
 * coisas muito diferentes: lead que já estava lá (certo) e lead que falhou ao
 * entrar (errado). Com um número só não dá para saber se alguém ficou de fora.
 *
 * E entrar na tabela não é o mesmo que aparecer no kanban. Duas coisas escondem
 * um lead que existe:
 *   * oculto_sdr, que a política de RLS usa para tirar da frente o que veio do
 *     RD e a base de marketing;
 *   * o filtro do próprio kanban, que exclui source = campaign_upload.
 *
 * A conferência olha linha a linha e diz em qual dos casos cada uma está.
 */

export type LinhaConferida = {
  leadId: string;
  nome: string | null;
  email: string | null;
  empresa: string | null;
  situacao: "no_pipeline" | "sem_responsavel" | "oculto" | "fora_por_origem" | "ausente";
  detalhe: string;
};

export const conferirPlanilhaNoPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        /** Mesmo recorte do filtro de período do kanban (yyyy-mm-dd). */
        de: z.string().optional(),
        ate: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores conferem a planilha.");

    const planilha = await fetchSheetRows();
    if (!planilha.ok) throw new Error(planilha.message ?? "Não consegui ler a planilha");

    /*
     * O kanban filtra por data de conversão (form_payload.submitted_at), então
     * a conferência usa o mesmo campo — senão os dois números nunca fecham.
     */
    const deTs = data.de ? new Date(data.de + "T00:00:00").getTime() : null;
    const ateTs = data.ate ? new Date(data.ate + "T23:59:59").getTime() : null;
    function dentroDoPeriodo(l: LeadRow) {
      if (deTs === null && ateTs === null) return true;
      const bruto = l.payload.submitted_at;
      if (!bruto) return false;
      const t = new Date(bruto).getTime();
      if (isNaN(t)) return false;
      if (deTs !== null && t < deTs) return false;
      if (ateTs !== null && t > ateTs) return false;
      return true;
    }

    // As mesmas regras da sincronização, para conferir o que ela conferiria.
    const linhas: LeadRow[] = [];
    const vistos = new Set<string>();
    const emailsVistos = new Set<string>();
    let vazias = 0;
    let repetidasNaPlanilha = 0;
    let foraDoPeriodo = 0;
    let semDataValida = 0;
    for (const item of planilha.rows) {
      const r = rowToLead(item.row, item.sheetIndex, item.rowIndex);
      if (!r) {
        vazias += 1;
        continue;
      }
      if (!dentroDoPeriodo(r)) {
        if (!r.payload.submitted_at) semDataValida += 1;
        else foraDoPeriodo += 1;
        continue;
      }
      if (vistos.has(r.meta_lead_id)) {
        repetidasNaPlanilha += 1;
        continue;
      }
      const email = r.payload.email?.toLowerCase() ?? null;
      if (email && emailsVistos.has(email)) {
        repetidasNaPlanilha += 1;
        continue;
      }
      vistos.add(r.meta_lead_id);
      if (email) emailsVistos.add(email);
      linhas.push(r);
    }

    /*
     * Lê com o cliente de serviço, e não com o do usuário.
     *
     * A política de RLS esconde oculto_sdr, e é justamente esse o caso que a
     * conferência precisa enxergar: lead que existe mas não aparece. Com o
     * cliente do usuário, ele apareceria como "ausente" e a conta mentiria.
     */
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type LeadNaBase = {
      oculto: boolean;
      source: string | null;
      assigned: string | null;
      campaign: string | null;
    };
    const porLeadId = new Map<string, LeadNaBase>();
    const porEmail = new Map<string, LeadNaBase>();

    const PAGINA = 1000;
    for (let pagina = 0; ; pagina += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("email, form_payload, oculto_sdr, source, assigned_to, campaign")
        .order("id", { ascending: true })
        .range(pagina, pagina + PAGINA - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) {
        const rr = r as {
          email: string | null;
          form_payload: { lead_id?: string } | null;
          oculto_sdr: boolean | null;
          source: string | null;
          assigned_to: string | null;
          campaign: string | null;
        };
        const info: LeadNaBase = {
          oculto: rr.oculto_sdr === true,
          source: rr.source,
          assigned: rr.assigned_to,
          campaign: rr.campaign,
        };
        if (rr.form_payload?.lead_id) porLeadId.set(rr.form_payload.lead_id, info);
        if (rr.email) porEmail.set(rr.email.toLowerCase(), info);
      }
      if (data.length < PAGINA) break;
    }

    const problemas: LinhaConferida[] = [];
    const contagem = {
      no_pipeline: 0,
      sem_responsavel: 0,
      oculto: 0,
      fora_por_origem: 0,
      ausente: 0,
    };
    /*
     * A mesma divisão das abas do kanban: consultoria de um lado, empresa e
     * pessoa física (e quem ainda não tem tipo) do outro. É assim que dá para
     * comparar com o "N leads no filtro atual" de cada aba.
     */
    const porFunil = {
      consultoria: { naPlanilha: 0, noKanban: 0 },
      empresas_e_pf: { naPlanilha: 0, noKanban: 0 },
    };
    /*
     * De onde vem quem está no kanban sem dono. Sem essa quebra, o número
     * sozinho não diz por onde atacar: origem é o campo que separa quem entrou
     * pela planilha de quem entrou pelo RD ou pelo WhatsApp.
     */
    const semDonoPorOrigem = new Map<string, number>();
    const semDonoPorCampanha = new Map<string, number>();

    for (const l of linhas) {
      const email = l.payload.email?.toLowerCase() ?? null;
      const achado = porLeadId.get(l.meta_lead_id) ?? (email ? porEmail.get(email) : undefined);

      let situacao: LinhaConferida["situacao"];
      let detalhe: string;

      if (!achado) {
        situacao = "ausente";
        detalhe = "Está na planilha e não existe na base. A sincronização não conseguiu inserir.";
      } else if (achado.oculto) {
        situacao = "oculto";
        detalhe = "Existe na base, mas está marcado como oculto do SDR e não aparece no kanban.";
      } else if ((achado.source ?? "") === "campaign_upload") {
        situacao = "fora_por_origem";
        detalhe =
          'Existe e está visível, mas o kanban esconde quem tem origem "campaign_upload". Troque a origem para ele aparecer.';
      } else if (!achado.assigned) {
        situacao = "sem_responsavel";
        detalhe = "Está no kanban, mas sem responsável — ninguém tem esse lead na própria fila.";
      } else {
        situacao = "no_pipeline";
        detalhe = "No kanban, com responsável.";
      }

      contagem[situacao] += 1;
      if (situacao === "sem_responsavel" && achado) {
        const origem = achado.source?.trim() || "(sem origem)";
        semDonoPorOrigem.set(origem, (semDonoPorOrigem.get(origem) ?? 0) + 1);
        const camp = achado.campaign?.trim() || "(sem campanha)";
        semDonoPorCampanha.set(camp, (semDonoPorCampanha.get(camp) ?? 0) + 1);
      }
      const tipo = normalizeLeadType(
        (l.payload.form_payload as { lead_type?: string } | null)?.lead_type ?? null,
      );
      const funil = tipo === "consultoria" ? "consultoria" : "empresas_e_pf";
      porFunil[funil].naPlanilha += 1;
      if (situacao === "no_pipeline" || situacao === "sem_responsavel")
        porFunil[funil].noKanban += 1;

      if (situacao !== "no_pipeline" && problemas.length < 300) {
        problemas.push({
          leadId: l.meta_lead_id,
          nome: l.payload.name ?? null,
          email: l.payload.email ?? null,
          empresa: l.payload.company_name ?? null,
          situacao,
          detalhe,
        });
      }
    }

    return {
      linhasNaPlanilha: planilha.rows.length,
      conferidas: linhas.length,
      vazias,
      repetidasNaPlanilha,
      foraDoPeriodo,
      semDataValida,
      periodo: { de: data.de ?? null, ate: data.ate ?? null },
      contagem,
      porFunil,
      semDonoPorOrigem: [...semDonoPorOrigem.entries()]
        .map(([origem, total]) => ({ origem, total }))
        .sort((x, y) => y.total - x.total),
      semDonoPorCampanha: [...semDonoPorCampanha.entries()]
        .map(([campanha, total]) => ({ campanha, total }))
        .sort((x, y) => y.total - x.total)
        .slice(0, 15),
      problemas,
    };
  });
