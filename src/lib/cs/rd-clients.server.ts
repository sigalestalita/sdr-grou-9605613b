import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRdTokenInfo } from "@/lib/rd-token.server";

const RD_BASE = "https://crm.rdstation.com/api/v1";

/** Ciclos de vida do RD que viram cliente no módulo de CS. */
export const RD_CLIENT_LIFECYCLES = ["Cliente", "Cliente Inativo", "Cliente de Partner"] as const;
export type RdLifecycle = (typeof RD_CLIENT_LIFECYCLES)[number];

type Json = Record<string, unknown>;

interface RdCustomField {
  custom_field_id?: string;
  _id?: string;
  value?: unknown;
  custom_field?: { _id?: string; label?: string; name?: string };
  label?: string;
  name?: string;
}

interface RdOrganization {
  _id?: string;
  id?: string;
  name?: string;
  url?: string;
  website?: string;
  site?: string;
  segment?: string | { name?: string };
  created_at?: string;
  user?: { name?: string; email?: string };
  organization_custom_fields?: RdCustomField[];
  custom_fields?: RdCustomField[];
}

function fieldLabel(f: RdCustomField): string {
  return (f.custom_field?.label ?? f.custom_field?.name ?? f.label ?? f.name ?? "")
    .toString()
    .trim()
    .toLowerCase();
}

function fieldValue(f: RdCustomField): string {
  const v = f.value;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ").trim();
  if (typeof v === "object") return String((v as Json).name ?? "").trim();
  return String(v).trim();
}

function customFields(o: RdOrganization): RdCustomField[] {
  return [...(o.organization_custom_fields ?? []), ...(o.custom_fields ?? [])];
}

/** Lê o campo customizado de organização "[Grou] Ciclo de Vida" (opção, não o texto legado). */
export function readLifecycle(o: RdOrganization): string | null {
  const fields = customFields(o);
  const option = fields.find((f) => fieldLabel(f).includes("[grou] ciclo de vida"));
  const fallback = fields.find((f) => fieldLabel(f).includes("ciclo de vida"));
  const raw = fieldValue(option ?? fallback ?? ({} as RdCustomField));
  return raw || null;
}

function readCnpj(o: RdOrganization): string | null {
  const f = customFields(o).find((x) => fieldLabel(x).includes("cnpj"));
  const raw = f ? fieldValue(f).replace(/\D/g, "") : "";
  return raw.length >= 11 ? raw : null;
}

function normalizeLifecycle(raw: string | null): RdLifecycle | null {
  if (!raw) return null;
  const v = raw.replace(/[\u200b-\u200f\ufeff]/g, "").trim().toLowerCase();
  if (v === "cliente") return "Cliente";
  if (v === "cliente inativo") return "Cliente Inativo";
  if (v === "cliente de partner") return "Cliente de Partner";
  return null;
}

function readSite(o: RdOrganization): string | null {
  const s = (o.url ?? o.website ?? o.site ?? "").toString().trim();
  return s || null;
}

function readSegment(o: RdOrganization): string | null {
  const s = typeof o.segment === "string" ? o.segment : o.segment?.name;
  return s?.trim() || null;
}

/** Consultoria quando o ciclo é "Cliente de Partner" ou o nome indica consultoria/assessoria. */
function guessType(o: RdOrganization, lifecycle: RdLifecycle): "empresa" | "consultoria" {
  if (lifecycle === "Cliente de Partner") return "consultoria";
  const n = (o.name ?? "").toLowerCase();
  return /consultoria|assessoria|partner/.test(n) ? "consultoria" : "empresa";
}

async function rdGet(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, token }).toString();
  const res = await fetch(`${RD_BASE}${path}?${qs}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RD ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Json;
}

/**
 * Percorre /organizations. O RD trava a paginação em ~9.000 registros, então varremos
 * a lista em ordem crescente e decrescente (por nome e por data) e juntamos sem duplicar.
 */
export async function fetchRdOrganizations(token: string, maxPages = 45): Promise<RdOrganization[]> {
  const out: RdOrganization[] = [];
  const seen = new Set<string>();
  const passes: Array<Record<string, string>> = [
    { order: "name", direction: "asc" },
    { order: "name", direction: "desc" },
    { order: "created_at", direction: "asc" },
    { order: "created_at", direction: "desc" },
  ];

  for (const pass of passes) {
    for (let page = 1; page <= maxPages; page++) {
      let json: Json;
      try {
        json = await rdGet("/organizations", { ...pass, page: String(page), limit: "200" }, token);
      } catch {
        break; // RD devolve 400 nas páginas mais profundas
      }
      const orgs = (json.organizations ?? []) as RdOrganization[];
      if (orgs.length === 0) break;
      let novos = 0;
      for (const o of orgs) {
        const id = o._id ?? o.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(o);
        novos++;
      }
      if (json.has_more === false) break;
      // Passada já totalmente coberta por outra ordenação: não vale seguir paginando.
      if (novos === 0 && page > 3) break;
    }
  }
  return out;
}


export interface RdClientSyncResult {
  fetched: number;
  matched: number;
  created: number;
  updated: number;
  errors: string[];
  /** Contagem por ciclo de vida do RD (apenas na prévia). */
  lifecycles?: Record<string, number>;
  /** rd_org_id -> client_uid dos clientes de CS resultantes. */
  orgToClient?: Map<string, string>;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Sincroniza as organizações do RD com ciclo de vida de cliente para os cards de CS.
 * Cria o que falta e atualiza o que já existe (sem apagar health score/sinaleira).
 */
export async function syncRdClientsToCs(opts?: {
  dryRun?: boolean;
  orgs?: RdOrganization[];
}): Promise<RdClientSyncResult> {
  let orgs = opts?.orgs;
  if (!orgs) {
    const { token } = await getRdTokenInfo();
    if (!token) throw new Error("RD Station não conectado. Conecte em Configurações.");
    orgs = await fetchRdOrganizations(token);
  }
  const candidates = orgs
    .map((o) => ({ o, lifecycle: normalizeLifecycle(readLifecycle(o)) }))
    .filter((c): c is { o: RdOrganization; lifecycle: RdLifecycle } => c.lifecycle !== null)
    .filter((c) => (c.o.name ?? "").trim().length > 0);


  const result: RdClientSyncResult = {
    fetched: orgs.length,
    matched: candidates.length,
    created: 0,
    updated: 0,
    errors: [],
  };
  if (opts?.dryRun) {
    const tally: Record<string, number> = {};
    for (const o of orgs) {
      const raw = readLifecycle(o) ?? "(vazio)";
      tally[raw] = (tally[raw] ?? 0) + 1;
    }
    return { ...result, lifecycles: tally };
  }


  const { fetchAllRows } = await import("@/lib/cs/cs-core.server");
  const existing = await fetchAllRows<{
    client_uid: string;
    nome_empresa: string;
    cnpj: string | null;
    rd_org_id: string | null;
  }>((from, to) =>
    supabaseAdmin.from("cs_clients").select("client_uid, nome_empresa, cnpj, rd_org_id").range(from, to),
  );


  const byRd = new Map<string, string>();
  const byName = new Map<string, string>();
  const byCnpj = new Map<string, string>();
  for (const c of existing ?? []) {
    if (c.rd_org_id) byRd.set(c.rd_org_id, c.client_uid);
    byName.set(norm(c.nome_empresa), c.client_uid);
    if (c.cnpj) byCnpj.set(c.cnpj.replace(/\D/g, ""), c.client_uid);
  }

  const now = new Date().toISOString();

  for (const { o, lifecycle } of candidates) {
    const rdId = (o._id ?? o.id) as string;
    const nome = (o.name as string).trim();
    const cnpj = readCnpj(o);
    const patch = {
      nome_empresa: nome,
      cnpj,
      site_url: readSite(o),
      setor: readSegment(o),
      rd_org_id: rdId,
      rd_lifecycle: lifecycle,
      rd_owner: o.user?.name ?? o.user?.email ?? null,
      rd_synced_at: now,
      ativo: lifecycle !== "Cliente Inativo",
    };

    const uid =
      byRd.get(rdId) ?? (cnpj ? byCnpj.get(cnpj) : undefined) ?? byName.get(norm(nome)) ?? null;

    if (uid) {
      const { error } = await supabaseAdmin
        .from("cs_clients")
        .update(patch as never)
        .eq("client_uid", uid);
      if (error) result.errors.push(`${nome}: ${error.message}`);
      else {
        result.updated++;
        byRd.set(rdId, uid);
      }
      continue;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("cs_clients")
      .insert({
        ...patch,
        tipo_lead: guessType(o, lifecycle),
        origem: "marketing",
        aporte_valor: 0,
        data_inicio_contrato: o.created_at ? o.created_at.slice(0, 10) : null,
      } as never)
      .select("client_uid")
      .single();
    if (error || !inserted) {
      result.errors.push(`${nome}: ${error?.message ?? "falha ao criar"}`);
      continue;
    }
    result.created++;
    byRd.set(rdId, inserted.client_uid);
    byName.set(norm(nome), inserted.client_uid);
    await supabaseAdmin.from("cs_timeline_events").insert({
      client_uid: inserted.client_uid,
      event_type: "card_criado",
      title: `Cliente importado do RD CRM (${lifecycle})`,
      metadata: { rd_org_id: rdId } as never,
      occurred_at: now,
    });
  }

  await supabaseAdmin.from("integration_logs").insert({
    provider: "rd_station",
    action: "sync_cs_clients",
    status: result.errors.length > 0 ? "partial" : "ok",
    detail: {
      fetched: result.fetched,
      matched: result.matched,
      created: result.created,
      updated: result.updated,
      errors: result.errors.slice(0, 20),
    } as never,
  });

  result.orgToClient = byRd;
  return result;

}
