/*
 * Sincronização da planilha de leads (Meta Ads e orgânico/outbound) → leads.
 *
 * Fica num módulo de servidor para rodar de dois jeitos: pelo kanban aberto
 * (função de servidor, com o cliente de quem está logado) e pelo agendamento
 * no banco a cada 2 minutos (hook público, com o cliente de serviço). Antes só
 * existia o primeiro — lead do Meta que chegava de noite esperava alguém abrir
 * o Pipeline para entrar no kanban.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeLeadType } from "./lead-type";
import { notifyNewLead } from "./lead-notify.server";

export const SPREADSHEET_ID = "1gGib1CJCUaS-1xNKBrexP7OzuY87u_ZDWehsJdz1U5A";
type SheetColumns = {
  data: number;
  tipo: number;
  nome: number;
  telefone: number;
  email: number;
  empresa: number;
  porte: number;
  cargo: number;
  area: number;
  sobrenome?: number;
  dor?: number;
  demo_free?: number;
  campanha?: number;
  conjunto?: number;
  ad?: number;
  campanha_id?: number;
  adset_id?: number;
  ad_id?: number;
  form_id?: number;
  lead_id?: number;
  fonte?: number;
};

type SheetConfig = {
  tab: string;
  source: string;
  channel: string;
  range: string;
  columns: SheetColumns;
};

const SHEETS: SheetConfig[] = [
  {
    tab: "entrada_correta",
    source: "meta_ads",
    channel: "meta_ads",
    range: "A2:W",
    columns: {
      data: 0,
      tipo: 1,
      nome: 2,
      sobrenome: 3,
      telefone: 4,
      email: 5,
      empresa: 7,
      area: 8,
      porte: 9,
      cargo: 10,
      dor: 11,
      demo_free: 12,
      campanha: 13,
      conjunto: 14,
      ad: 15,
      campanha_id: 17,
      adset_id: 18,
      ad_id: 19,
      form_id: 21,
      lead_id: 22,
    },
  },
  {
    tab: "entrada_correta_organico-outbound",
    source: "organico_outbound",
    channel: "organico_outbound",
    range: "A2:J",
    columns: {
      data: 0,
      tipo: 1,
      nome: 2,
      telefone: 3,
      email: 4,
      empresa: 5,
      porte: 6,
      cargo: 7,
      area: 8,
      fonte: 9,
    },
  },
];
const SHEET_RANGES = SHEETS.map((s) => `${s.tab}!${s.range}`);
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SYNC_MIN_INTERVAL_MS = 90_000;

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
    return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
}

function cleanStr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === ".") return null;
  return s;
}

function parseDate(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDemoFree(v: unknown): boolean | null {
  const s = cleanStr(v);
  if (!s) return null;
  const t = s.toLowerCase();
  if (/^(sim|s|yes|y|true|1|x|✓)$/.test(t)) return true;
  if (/^(não|nao|n|no|false|0)$/.test(t)) return false;
  return null;
}

export type LeadRow = {
  meta_lead_id: string;
  source: string;
  channel: string;
  payload: {
    name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    position: string | null;
    company_segment: string | null;
    company_size: string | null;
    probable_pain: string | null;
    demo_free: boolean | null;
    demo_free_raw: string | null;
    campaign: string | null;
    ad_name: string | null;
    form_name: string | null;
    submitted_at: string | null;
    form_payload: Record<string, unknown>;
  };
};

type SheetFetchResult =
  | { ok: true; rows: Array<{ row: string[]; sheetIndex: number; rowIndex: number }> }
  | { ok: false; status: number; message: string; rateLimited: boolean };

function hashRow(parts: Array<string | null>): string {
  let h = 0;
  const s = parts.map((p) => p ?? "").join("|");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function getRowValue(row: string[], index: number | undefined): string | null {
  if (index === undefined) return null;
  return cleanStr(row[index]);
}

export function rowToLead(row: string[], sheetIndex: number, rowIndex: number): LeadRow | null {
  const sheet = SHEETS[sheetIndex] ?? SHEETS[0];
  const c = sheet.columns;
  const nome = getRowValue(row, c.nome) ?? "";
  const sobrenome = getRowValue(row, c.sobrenome) ?? "";
  const name = `${nome} ${sobrenome}`.trim() || "(sem nome)";
  const email = getRowValue(row, c.email);
  const phone = normalizePhone(getRowValue(row, c.telefone));
  const companyName = getRowValue(row, c.empresa);
  const position = getRowValue(row, c.cargo);
  const companySegment = getRowValue(row, c.area);
  const companySize = getRowValue(row, c.porte);
  const probablePain = getRowValue(row, c.dor);
  const demoFreeRaw = getRowValue(row, c.demo_free);
  const campaign = getRowValue(row, c.campanha);
  const adName = getRowValue(row, c.ad);
  const formName = getRowValue(row, c.form_id);
  const submittedAt = parseDate(getRowValue(row, c.data));
  const sourceLabel = getRowValue(row, c.fonte);
  let leadId = getRowValue(row, c.lead_id);
  if (!leadId) {
    // Fallback estável para abas sem Lead_ID:
    // usa email/phone se houver, senão hash do conteúdo + posição.
    const base =
      email ??
      phone ??
      hashRow([getRowValue(row, c.data), nome, sobrenome, companyName, position, String(rowIndex)]);
    leadId = `${sheet.tab}:${base}`;
  }
  // Se a linha estiver totalmente vazia (sem nome, email, phone, empresa), ignora.
  if (!nome && !sobrenome && !email && !phone && !companyName) return null;
  return {
    meta_lead_id: leadId,
    source: sourceLabel ?? sheet.source,
    channel: sheet.channel,
    payload: {
      name,
      email,
      phone,
      company_name: companyName,
      position,
      company_segment: companySegment,
      company_size: companySize,
      probable_pain: probablePain,
      demo_free: parseDemoFree(demoFreeRaw),
      demo_free_raw: demoFreeRaw,
      campaign,
      ad_name: adName,
      form_name: formName,
      submitted_at: submittedAt,
      form_payload: {
        lead_id: leadId,
        sheet_tab: sheet.tab,
        form_id: formName,
        lead_type: getRowValue(row, c.tipo),
        demo_free_raw: demoFreeRaw,
        ad_set: getRowValue(row, c.conjunto),
        source_label: sourceLabel,
        meta_ids: {
          campaign_id: getRowValue(row, c.campanha_id),
          adset_id: getRowValue(row, c.adset_id),
          ad_id: getRowValue(row, c.ad_id),
        },
        submitted_at: submittedAt,
      },
    },
  };
}

export async function fetchSheetRows(): Promise<SheetFetchResult> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  if (!LOVABLE_API_KEY)
    return { ok: false, status: 500, message: "LOVABLE_API_KEY ausente", rateLimited: false };
  if (!GOOGLE_SHEETS_API_KEY) {
    return {
      ok: false,
      status: 500,
      message: "GOOGLE_SHEETS_API_KEY ausente — conecte o Google Sheets em Connectors",
      rateLimited: false,
    };
  }
  const params = SHEET_RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
    },
  }).catch(() => null);
  if (!res) {
    return {
      ok: false,
      status: 503,
      message: "Falha temporária ao consultar o Google Sheets",
      rateLimited: false,
    };
  }
  if (!res.ok) {
    const body = await res.text();
    const rateLimited =
      res.status === 429 || body.includes('"code": 429') || body.includes("Quota exceeded");
    return {
      ok: false,
      status: res.status,
      message: `Google Sheets API ${res.status}: ${body.slice(0, 300)}`,
      rateLimited,
    };
  }
  const json = (await res.json()) as { valueRanges?: Array<{ values?: string[][] }> };
  const rows: Array<{ row: string[]; sheetIndex: number; rowIndex: number }> = [];
  (json.valueRanges ?? []).forEach((vr, sheetIndex) => {
    (vr.values ?? []).forEach((r, rowIndex) => {
      rows.push({ row: r, sheetIndex, rowIndex });
    });
  });
  return { ok: true, rows };
}

export async function sincronizarPlanilha(
  supabase: SupabaseClient<Database>,
  data: { limit?: number } = {},
) {
  // Throttle: não buscar a planilha se já tentamos sincronizar há pouco.
  const { data: prev } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "sheets_sync_state")
    .maybeSingle();
  const prevState = (prev?.value ?? null) as null | {
    last_sync_at?: string;
    last_attempt_at?: string;
  };
  const lastAttempt = prevState?.last_attempt_at ?? prevState?.last_sync_at;
  if (lastAttempt) {
    const ageMs = Date.now() - new Date(lastAttempt).getTime();
    if (ageMs < SYNC_MIN_INTERVAL_MS) {
      return {
        total: 0,
        parsed: 0,
        inserted: 0,
        skipped: 0,
        throttled: true,
        retry_after_ms: SYNC_MIN_INTERVAL_MS - ageMs,
      };
    }
  }

  const startedAt = new Date().toISOString();
  await supabase.from("app_settings").upsert(
    {
      key: "sheets_sync_state",
      value: { ...(prevState ?? {}), last_attempt_at: startedAt, status: "running" } as never,
    } as never,
    { onConflict: "key" },
  );

  const sheetResult = await fetchSheetRows();
  if (!sheetResult.ok) {
    const stateValue = {
      ...(prevState ?? {}),
      last_attempt_at: startedAt,
      last_error_at: new Date().toISOString(),
      last_error: sheetResult.message,
      status: sheetResult.rateLimited ? "rate_limited" : "error",
    };
    await supabase
      .from("app_settings")
      .upsert({ key: "sheets_sync_state", value: stateValue as never } as never, {
        onConflict: "key",
      });
    await supabase.from("integration_logs").insert({
      provider: "google_sheets",
      action: "sync_leads",
      status: sheetResult.rateLimited ? "rate_limited" : "error",
      detail: { error: sheetResult.message, status: sheetResult.status } as never,
    });
    return {
      total: 0,
      parsed: 0,
      inserted: 0,
      skipped: 0,
      rate_limited: sheetResult.rateLimited,
      error: sheetResult.message,
    };
  }
  const rows = sheetResult.rows;
  const total = rows.length;

  const parsed: LeadRow[] = [];
  const seen = new Set<string>();
  for (const item of rows) {
    const r = rowToLead(item.row, item.sheetIndex, item.rowIndex);
    if (!r) continue;
    if (seen.has(r.meta_lead_id)) continue;
    seen.add(r.meta_lead_id);
    parsed.push(r);
  }

  /*
   * Lê a base com o cliente de serviço, e não com o do usuário: a policy
   * leads_auth_visiveis esconde quem está com oculto_sdr, e um lead escondido
   * que a planilha não enxerga vira INSERT duplicado que o índice único de
   * lower(email) derruba — ou seja, a conversão se perderia em silêncio.
   * O .order("id") é obrigatório: .range() sem ordem estável repete e pula
   * linhas entre as páginas.
   */
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  type LeadJaNaBase = {
    id: string;
    oculto_sdr: boolean | null;
  };
  const existingIds = new Set<string>();
  const porEmail = new Map<string, LeadJaNaBase>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    /*
     * Só os pedaços do form_payload que importam aqui. O blob inteiro de
     * toda a base, a cada 90 s, era a parte mais pesada da sincronização.
     * As reconversões entram na conta: a linha da planilha que já foi
     * registrada como reconversão não é nova, e antes ela era registrada de
     * novo a cada rodada (o histórico do lead crescia sem parar).
     */
    const { data: rows2, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, email, oculto_sdr, lead_id:form_payload->>lead_id, reconversoes:form_payload->reconversoes",
      )
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    // Base lida pela metade faria lead existente parecer novo: melhor parar.
    if (error) {
      const msg = `Leitura dos leads falhou: ${error.message}`;
      await supabase.from("app_settings").upsert(
        {
          key: "sheets_sync_state",
          value: {
            ...(prevState ?? {}),
            last_attempt_at: startedAt,
            last_error_at: new Date().toISOString(),
            last_error: msg,
            status: "error",
          } as never,
        } as never,
        { onConflict: "key" },
      );
      await supabase.from("integration_logs").insert({
        provider: "google_sheets",
        action: "sync_leads",
        status: "error",
        detail: { error: msg } as never,
      });
      return { total, parsed: parsed.length, inserted: 0, skipped: 0, error: msg };
    }
    if (!rows2 || rows2.length === 0) break;
    for (const r of rows2) {
      const rr = r as unknown as LeadJaNaBase & {
        email: string | null;
        lead_id: string | null;
        reconversoes: Array<{ lead_id?: string }> | null;
      };
      if (rr.lead_id) existingIds.add(rr.lead_id);
      if (Array.isArray(rr.reconversoes))
        for (const rc of rr.reconversoes) if (rc?.lead_id) existingIds.add(rc.lead_id);
      if (rr.email)
        porEmail.set(rr.email.toLowerCase(), {
          id: rr.id,
          oculto_sdr: rr.oculto_sdr,
        });
    }
    if (rows2.length < PAGE) break;
  }

  /*
   * Uma linha cujo email já está na base não é lixo: é a mesma pessoa
   * convertendo de novo. Antes ela era descartada e a reconversão não
   * aparecia em lugar nenhum. Agora vira um registro no lead que já existe.
   */
  const reconversoesNaBase: Array<{ leadId: string; oculto: boolean; linha: LeadRow }> = [];
  const reconversoesNoLote: LeadRow[] = [];
  const seenEmail = new Set<string>();
  const toInsert = parsed.filter((p) => {
    if (existingIds.has(p.meta_lead_id)) return false;
    const em = p.payload.email?.toLowerCase() ?? null;
    if (em) {
      const jaNaBase = porEmail.get(em);
      if (jaNaBase) {
        reconversoesNaBase.push({
          leadId: jaNaBase.id,
          oculto: jaNaBase.oculto_sdr === true,
          linha: p,
        });
        return false;
      }
      if (seenEmail.has(em)) {
        reconversoesNoLote.push(p);
        return false;
      }
      seenEmail.add(em);
    }
    return true;
  });
  const limit = data.limit ?? toInsert.length;
  const batch = toInsert.slice(0, limit);

  // Stage "novo"
  const { data: novo } = await supabase
    .from("stages")
    .select("id")
    .eq("slug", "novo")
    .maybeSingle();
  const novoId = novo?.id ?? null;

  let inserted = 0;
  const insertErrors: string[] = [];
  const insertedLeads: Array<{
    id: string;
    name: string;
    email: string | null;
    company_name: string | null;
    lead_type: string | null;
    score: number | null;
    priority: string | null;
  }> = [];
  const CHUNK = 100;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    const chunk = slice.map((p) => {
      const createdAt = p.payload.submitted_at ?? new Date().toISOString();
      return {
        name: p.payload.name,
        email: p.payload.email,
        phone: p.payload.phone,
        company_name: p.payload.company_name,
        original_company_name: p.payload.company_name,
        position: p.payload.position,
        company_segment: p.payload.company_segment,
        company_size: p.payload.company_size,
        probable_pain: p.payload.probable_pain,
        demo_free: p.payload.demo_free,
        campaign: p.payload.campaign,
        ad_name: p.payload.ad_name,
        form_name: p.payload.form_name,
        source: p.source,
        channel: p.channel,
        stage_id: novoId,
        enrichment_status: "pending" as const,
        form_payload: p.payload.form_payload as never,
        lead_type: normalizeLeadType(
          (p.payload.form_payload as { lead_type?: string } | null)?.lead_type ?? null,
        ),
        created_at: createdAt,
        last_action_at: createdAt,
        stage_entered_at: createdAt,
      };
    });
    const { data: insData, error } = await supabase
      .from("leads")
      .insert(chunk as never)
      .select("id, name, email, company_name, lead_type, score, priority");
    if (!error) {
      inserted += chunk.length;
      for (const r of insData ?? []) {
        insertedLeads.push(r as never);
      }
      continue;
    }
    // Fallback row-by-row para isolar conflitos (email duplicado, etc.).
    for (const row of chunk) {
      const { data: rowData, error: rowErr } = await supabase
        .from("leads")
        .insert(row as never)
        .select("id, name, email, company_name, lead_type, score, priority")
        .maybeSingle();
      if (!rowErr) {
        inserted += 1;
        if (rowData) insertedLeads.push(rowData as never);
      } else if (insertErrors.length < 10) insertErrors.push(rowErr.message);
    }
  }

  /*
   * Reconversões: a pessoa já estava na base, então nada de lead novo — o
   * que a planilha traz é um novo contato dela, e isso fica registrado no
   * lead que existe. Se ele estava escondido do kanban (base de marketing
   * do RD), a conversão o traz de volta para o funil de SDR.
   */
  const porEmailInserido = new Map<string, string>();
  for (const l of insertedLeads) if (l.email) porEmailInserido.set(l.email.toLowerCase(), l.id);
  const paraRegistrar = [
    ...reconversoesNaBase,
    ...reconversoesNoLote.flatMap((linha) => {
      const id = porEmailInserido.get(linha.payload.email?.toLowerCase() ?? "");
      return id ? [{ leadId: id, oculto: false, linha }] : [];
    }),
  ];
  let reconversoes = 0;
  let desocultados = 0;
  let completados = 0;
  let roteados = 0;
  /*
   * Só distribui quem converteu há pouco.
   *
   * Quem chega pelo RD entra sem tipo de lead, e sem tipo o roteamento não
   * sabe para qual SDR mandar — por isso tanta gente ficou sem dono. Agora a
   * planilha preenche o tipo e o lead passa a poder ser distribuído. A
   * janela existe para não despejar a fila inteira de uma vez na primeira
   * sincronização depois desta mudança.
   */
  const JANELA_DE_ROTEAMENTO_MS = 7 * 24 * 60 * 60 * 1000;
  const { ensureLeadRouted } = await import("./lead-routing.server");

  for (const { leadId, oculto, linha } of paraRegistrar) {
    const quando = linha.payload.submitted_at ?? new Date().toISOString();
    const { data: atual } = await supabaseAdmin
      .from("leads")
      .select(
        "form_payload, lead_type, company_size, position, company_segment, probable_pain, demo_free, campaign, ad_name, phone, company_name, assigned_to",
      )
      .eq("id", leadId)
      .maybeSingle();
    const leadAtual = (atual ?? {}) as Record<string, unknown>;
    const anterior = (leadAtual.form_payload ?? {}) as Record<string, unknown>;
    const historico = Array.isArray(anterior.reconversoes) ? anterior.reconversoes : [];
    const patch: Record<string, unknown> = {
      last_action_at: quando,
      form_payload: {
        ...anterior,
        // O tipo de lead do formulário do Meta: é ele que o kanban lê e o
        // roteamento usa. Quem entrou pelo RD chega sem nada disso.
        lead_type:
          anterior.lead_type ??
          (linha.payload.form_payload as { lead_type?: string } | null)?.lead_type ??
          null,
        reconversoes: [
          ...historico.filter(
            (h) => (h as { lead_id?: string } | null)?.lead_id !== linha.meta_lead_id,
          ),
          {
            em: quando,
            lead_id: linha.meta_lead_id,
            origem: linha.source,
            campanha: linha.payload.campaign ?? null,
          },
        ],
      },
    };

    /*
     * A planilha traz o que o RD não tem: tipo de lead, porte, cargo, área e
     * a dor declarada no formulário. Preenche só o que está vazio — o que já
     * foi apurado pelo enriquecimento ou pela SDR continua valendo.
     */
    const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
    const doFormulario: Record<string, unknown> = {
      lead_type: normalizeLeadType(
        (linha.payload.form_payload as { lead_type?: string } | null)?.lead_type ?? null,
      ),
      company_size: linha.payload.company_size,
      position: linha.payload.position,
      company_segment: linha.payload.company_segment,
      probable_pain: linha.payload.probable_pain,
      demo_free: linha.payload.demo_free,
      campaign: linha.payload.campaign,
      ad_name: linha.payload.ad_name,
      phone: linha.payload.phone,
      company_name: linha.payload.company_name,
    };
    let preencheu = false;
    for (const [campo, valor] of Object.entries(doFormulario)) {
      if (vazio(valor)) continue;
      if (!vazio(leadAtual[campo])) continue;
      patch[campo] = valor;
      preencheu = true;
    }
    if (oculto) {
      patch.oculto_sdr = false;
      patch.stage_id = novoId;
      patch.stage_entered_at = quando;
    }
    const { error: errRec } = await supabaseAdmin
      .from("leads")
      .update(patch as never)
      .eq("id", leadId);
    if (errRec) continue;
    reconversoes += 1;
    if (preencheu) completados += 1;
    if (oculto) desocultados += 1;

    // Agora que o lead tem tipo, o roteamento consegue escolher a SDR.
    const recente = Date.now() - new Date(quando).getTime() <= JANELA_DE_ROTEAMENTO_MS;
    if (preencheu && recente && vazio(leadAtual.assigned_to)) {
      try {
        const dono = await ensureLeadRouted({ supabase: supabaseAdmin, leadId });
        if (dono) roteados += 1;
      } catch {
        /* distribuir é melhor-esforço: não pode derrubar a sincronização */
      }
    }
  }

  // Disparar notificações por e-mail (não bloqueia o resultado da sync).
  await Promise.allSettled(
    insertedLeads.map((l) =>
      notifyNewLead({
        id: l.id,
        name: l.name,
        company_name: l.company_name,
        lead_type: (l.lead_type as never) ?? null,
        score: l.score,
        priority: l.priority,
      }),
    ),
  );

  const skipped = parsed.length - inserted - reconversoes;
  const stateValue = {
    last_attempt_at: startedAt,
    last_sync_at: new Date().toISOString(),
    status: insertErrors.length ? "partial" : "ok",
    total_rows: total,
    parsed: parsed.length,
    inserted_total_run: inserted,
    reconversoes,
    completados,
    roteados,
    desocultados,
    skipped_existing: existingIds.size,
    insert_errors: insertErrors,
  };
  await supabase
    .from("app_settings")
    .upsert({ key: "sheets_sync_state", value: stateValue as never } as never, {
      onConflict: "key",
    });
  await supabase.from("integration_logs").insert({
    provider: "google_sheets",
    action: "sync_leads",
    status: insertErrors.length ? "partial" : "ok",
    detail: {
      total,
      parsed: parsed.length,
      inserted,
      reconversoes,
      completados,
      roteados,
      desocultados,
      skipped,
      insert_errors: insertErrors,
    } as never,
  });

  return {
    total,
    parsed: parsed.length,
    inserted,
    reconversoes,
    completados,
    roteados,
    desocultados,
    skipped,
  };
}
