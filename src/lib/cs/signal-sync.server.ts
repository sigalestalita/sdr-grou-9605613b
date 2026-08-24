import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mondayOf, type CsSignal } from "@/lib/cs-types";
import { recomputeHealth } from "./cs-core.server";

const SPREADSHEET_ID = "191ZmqoIwCPrmtL2KxDMMSBpZ3_bSBuCp6_H6b8iRNmY";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function gatewayHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY ausente");
  if (!key) throw new Error("GOOGLE_SHEETS_API_KEY ausente — conecte o Google Sheets em Connectors");
  return {
    Accept: "application/json",
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": key,
  };
}

/** Títulos das abas, na ordem em que aparecem na planilha. */
export async function listSheetTabs(): Promise<string[]> {
  const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: gatewayHeaders() });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (json.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/** Aba mais recente: maior data detectada no título; sem data, a última da planilha. */
export function pickLatestTab(tabs: string[]): string | null {
  if (tabs.length === 0) return null;
  let best: { tab: string; score: number } | null = null;
  for (const tab of tabs) {
    const score = tabDateScore(tab);
    if (score !== null && (!best || score > best.score)) best = { tab, score };
  }
  if (best) return best.tab;
  const dataTabs = tabs.filter((t) => /sinaleira/i.test(t));
  const pool = dataTabs.length > 0 ? dataTabs : tabs;
  return pool[pool.length - 1];
}

function tabDateScore(tab: string): number | null {
  const iso = tab.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return y * 10000 + m * 100 + d;
  }
  const dmy = tab.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const yRaw = dmy[3] ? Number(dmy[3]) : new Date().getUTCFullYear();
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return y * 10000 + m * 100 + d;
  }
  return null;
}

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseSignal(raw: unknown, consumo: number | null): CsSignal {
  const v = norm(raw);
  if (!v || /^n\/?d$|^nd$|sem dado|indispon/.test(v)) {
    if (consumo == null) return "sem_dado";
  }
  if (/verde|green|\bok\b|bom/.test(v)) return "verde";
  if (/amarel|yellow|atencao|medio/.test(v)) return "amarelo";
  if (/vermelh|red|critic|ruim|preto|black/.test(v)) return "vermelho";
  if (consumo != null) {
    if (consumo >= 0.7) return "verde";
    if (consumo >= 0.3) return "amarelo";
    return "vermelho";
  }
  return "sem_dado";
}

/** Número em formato pt-BR ("1.234,5" -> 1234.5). */
function parseNum(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/%/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Percentual: aceita "85%", "0,85" e "1,2" (razão consumo/meta). */
function parsePct(raw: unknown): number | null {
  const txt = String(raw ?? "");
  const n = parseNum(txt);
  if (n == null) return null;
  if (txt.includes("%")) return n / 100;
  return n > 5 ? n / 100 : n;
}

type SyncResult = {
  ok: boolean;
  tab?: string;
  weekStart?: string;
  rows?: number;
  matched?: number;
  created?: number;
  unmatched?: string[];
  error?: string;
};

/** Lê a aba mais recente da planilha da sinaleira e grava o snapshot da semana. */
export async function syncSignalFromSheet(opts?: {
  tab?: string;
  weekStart?: string;
  /** Cria no CS os clientes da planilha que ainda não existem (padrão: sim). */
  createMissing?: boolean;
}): Promise<SyncResult> {
  try {
    const tabs = await listSheetTabs();
    const tab = opts?.tab ?? pickLatestTab(tabs);
    if (!tab) return { ok: false, error: "Nenhuma aba encontrada na planilha" };

    const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${tab}!A1:Z2000`)}`;
    const res = await fetch(url, { headers: gatewayHeaders() });
    if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { values?: unknown[][] };
    const values = json.values ?? [];
    if (values.length < 2) return { ok: false, tab, error: "Aba sem dados" };

    const header = (values[0] ?? []).map(norm);
    // Padrões em ordem de prioridade: o primeiro padrão que casar decide a coluna.
    const findCol = (patterns: RegExp[]) => {
      for (const p of patterns) {
        const idx = header.findIndex((h) => p.test(h));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const colEmpresa = findCol([/nome da conta/, /empresa|cliente|razao|conta/]);
    const colUid = findCol([/client_uid/, /^codigo|\bcod\b|\buid\b/]);
    const colLogin = findCol([/login/]);
    const colSignal = findCol([/^sinaleira/, /sinaleira|farol|\bcor\b/]);
    const colConsumo = findCol([/comparativo/, /consumo|uso|utilizacao|%/]);
    const colMotivo = findCol([/motivo/]);
    const colResponsavel = findCol([/^responsavel/, /responsavel/]);
    const colSaldo = findCol([/saldo atual|^saldo/]);
    const colTipo = findCol([/tipo do lead|tipo de conta/]);
    const colCiclo = findCol([/ciclo de vida/]);

    if (colEmpresa < 0 && colUid < 0 && colLogin < 0) {
      return { ok: false, tab, error: "Não encontrei coluna de empresa/código/login na aba" };
    }

    const loadClients = async () => {
      const { data } = await supabaseAdmin
        .from("cs_clients")
        .select("client_uid, nome_empresa, login_pda");
      const byName = new Map<string, string>();
      const byUid = new Map<string, string>();
      const byLogin = new Map<string, string>();
      for (const c of data ?? []) {
        byUid.set(norm(c.client_uid), c.client_uid);
        byName.set(norm(c.nome_empresa), c.client_uid);
        if (c.login_pda) byLogin.set(norm(c.login_pda), c.client_uid);
      }
      return { byName, byUid, byLogin };
    };

    let { byName, byUid, byLogin } = await loadClients();

    const dataRows = values.slice(1).filter((row) => {
      if (colCiclo < 0) return true;
      const ciclo = norm(row[colCiclo]);
      return !ciclo || /cliente/.test(ciclo);
    });

    const keyOf = (row: unknown[]) => ({
      nome: colEmpresa >= 0 ? String(row[colEmpresa] ?? "").trim() : "",
      uid: colUid >= 0 ? String(row[colUid] ?? "").trim() : "",
      login: colLogin >= 0 ? String(row[colLogin] ?? "").trim() : "",
    });
    const resolve = (k: { nome: string; uid: string; login: string }) =>
      (k.uid && byUid.get(norm(k.uid))) ||
      (k.login && byLogin.get(norm(k.login))) ||
      (k.nome && byName.get(norm(k.nome))) ||
      null;

    // Cria os clientes que ainda não existem no CS a partir da planilha.
    let created = 0;
    if (opts?.createMissing !== false) {
      const seen = new Set<string>();
      const toCreate: Array<Record<string, unknown>> = [];
      for (const row of dataRows) {
        const k = keyOf(row);
        if (!k.nome || resolve(k)) continue;
        const dedupe = norm(k.nome);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const tipoRaw = colTipo >= 0 ? norm(row[colTipo]) : "";
        toCreate.push({
          nome_empresa: k.nome,
          login_pda: k.login || null,
          tipo_lead: /consultoria/.test(tipoRaw) ? "consultoria" : "empresa",
          origem: "marketing",
        });
      }
      for (let i = 0; i < toCreate.length; i += 200) {
        const chunk = toCreate.slice(i, i + 200);
        const { error } = await supabaseAdmin.from("cs_clients").insert(chunk as never);
        if (error) throw new Error(`Falha ao criar clientes: ${error.message}`);
        created += chunk.length;
      }
      if (created > 0) ({ byName, byUid, byLogin } = await loadClients());
    }

    const weekStart = opts?.weekStart ?? mondayOf();
    const rows: Array<{
      client_uid: string;
      week_start: string;
      signal: CsSignal;
      consumo_pct: number | null;
      source: string;
      metadata: Record<string, unknown>;
    }> = [];
    const unmatched: string[] = [];

    const seenSnapshot = new Set<string>();
    for (const row of dataRows) {
      const { nome, uid, login } = keyOf(row);
      if (!nome && !uid && !login) continue;

      const clientUid = resolve({ nome, uid, login });
      if (!clientUid) {
        if (nome || uid || login) unmatched.push(nome || uid || login);
        continue;
      }

      if (seenSnapshot.has(clientUid)) continue;
      seenSnapshot.add(clientUid);

      const consumo = colConsumo >= 0 ? parsePct(row[colConsumo]) : null;
      rows.push({
        client_uid: clientUid,
        week_start: weekStart,
        signal: parseSignal(colSignal >= 0 ? row[colSignal] : null, consumo),
        consumo_pct: consumo,
        source: `planilha:${tab}`,
        metadata: {
          tab,
          nome_planilha: nome || null,
          login_pda: login || null,
          motivo: colMotivo >= 0 ? String(row[colMotivo] ?? "") || null : null,
          responsavel: colResponsavel >= 0 ? String(row[colResponsavel] ?? "") || null : null,
          saldo_atual: colSaldo >= 0 ? parseNum(row[colSaldo]) : null,
          tipo: colTipo >= 0 ? String(row[colTipo] ?? "") || null : null,
        },
      });
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("cs_signal_snapshots")
        .upsert(rows as never, { onConflict: "client_uid,week_start" });
      if (error) throw new Error(error.message);

      for (const r of rows) {
        await supabaseAdmin
          .from("cs_clients")
          .update({ current_signal: r.signal, pda_consumo_pct: r.consumo_pct })
          .eq("client_uid", r.client_uid);
        await recomputeHealth(supabaseAdmin, r.client_uid);
      }
    }

    await supabaseAdmin.from("integration_logs").insert({
      provider: "cs_signal",
      action: "sheet_sync",
      status: "success",
      detail: { tab, weekStart, created, matched: rows.length, unmatched: unmatched.slice(0, 50) } as never,
    });

    return {
      ok: true,
      tab,
      weekStart,
      rows: values.length - 1,
      matched: rows.length,
      created,
      unmatched: Array.from(new Set(unmatched)).slice(0, 50),
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("integration_logs").insert({
      provider: "cs_signal",
      action: "sheet_sync",
      status: "error",
      detail: { error } as never,
    });
    return { ok: false, error };
  }
}
