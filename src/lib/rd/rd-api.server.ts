/**
 * Camada de acesso ao RD CRM. O RD trava a paginação em ~9.000 registros por
 * ordenação, então varremos cada coleção em várias ordens e juntamos sem duplicar.
 */
const RD_BASE = "https://crm.rdstation.com/api/v1";

export type Json = Record<string, unknown>;

export interface RdCustomField {
  custom_field_id?: string;
  _id?: string;
  value?: unknown;
  custom_field?: { _id?: string; label?: string; name?: string };
  label?: string;
  name?: string;
}

export interface RdContactRaw {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  job_title?: string;
  linkedin?: string;
  emails?: Array<{ email?: string }>;
  phones?: Array<{ phone?: string; type?: string }>;
  organization?: { _id?: string; id?: string; name?: string };
  user?: { name?: string; email?: string };
  contact_custom_fields?: RdCustomField[];
  custom_fields?: RdCustomField[];
}

export interface RdOrganizationRaw {
  _id?: string;
  id?: string;
  name?: string;
  url?: string;
  website?: string;
  site?: string;
  segment?: string | { name?: string };
  created_at?: string;
  user?: { name?: string; email?: string };
  contacts?: RdContactRaw[];
  organization_custom_fields?: RdCustomField[];
  custom_fields?: RdCustomField[];
}

export interface RdDealRaw {
  _id?: string;
  id?: string;
  name?: string;
  amount_total?: number | string;
  amount_unique?: number | string;
  win?: boolean | null;
  hold?: boolean | null;
  closed_at?: string | null;
  created_at?: string;
  deal_stage?: { _id?: string; name?: string; deal_pipeline?: { _id?: string; name?: string } };
  deal_pipeline?: { _id?: string; name?: string };
  organization?: { _id?: string; id?: string; name?: string };
  contacts?: RdContactRaw[];
  user?: { name?: string; email?: string };
  campaign?: { name?: string };
  deal_source?: { name?: string };
  source?: { name?: string } | string;
  deal_custom_fields?: RdCustomField[];
}

export function rdId(x: { _id?: string; id?: string } | undefined | null): string | null {
  return (x?._id ?? x?.id ?? null) || null;
}

export function fieldLabel(f: RdCustomField): string {
  return (f.custom_field?.label ?? f.custom_field?.name ?? f.label ?? f.name ?? "")
    .toString()
    .trim()
    .toLowerCase();
}

export function fieldValue(f: RdCustomField): string {
  const v = f.value;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ").trim();
  if (typeof v === "object") return String((v as Json).name ?? "").trim();
  return String(v).trim();
}

export function findField(fields: RdCustomField[], ...needles: string[]): string | null {
  for (const n of needles) {
    const f = fields.find((x) => fieldLabel(x).includes(n));
    const v = f ? fieldValue(f) : "";
    if (v) return v;
  }
  return null;
}

export async function rdGet(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, token }).toString();
  const res = await fetch(`${RD_BASE}${path}?${qs}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RD ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Json;
}

const PASSES: Array<Record<string, string>> = [
  { order: "name", direction: "asc" },
  { order: "name", direction: "desc" },
  { order: "created_at", direction: "asc" },
  { order: "created_at", direction: "desc" },
];

/** Varredura completa de uma coleção paginada do RD, sem duplicar registros. */
export async function fetchAllRd<T extends { _id?: string; id?: string }>(
  path: string,
  collectionKey: string,
  token: string,
  opts?: { maxPages?: number; extraParams?: Record<string, string> },
): Promise<T[]> {
  const maxPages = opts?.maxPages ?? 45;
  const out: T[] = [];
  const seen = new Set<string>();

  for (const pass of PASSES) {
    for (let page = 1; page <= maxPages; page++) {
      let json: Json;
      try {
        json = await rdGet(
          path,
          { ...(opts?.extraParams ?? {}), ...pass, page: String(page), limit: "200" },
          token,
        );
      } catch {
        break; // páginas profundas devolvem erro no RD
      }
      const rows = (json[collectionKey] ?? []) as T[];
      if (rows.length === 0) break;
      let novos = 0;
      for (const r of rows) {
        const id = rdId(r);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(r);
        novos++;
      }
      if (json.has_more === false) break;
      if (novos === 0 && page > 3) break;
    }
  }
  return out;
}

export const fetchRdOrganizations = (token: string, maxPages = 45) =>
  fetchAllRd<RdOrganizationRaw>("/organizations", "organizations", token, { maxPages });

export const fetchRdContacts = (token: string, maxPages = 45) =>
  fetchAllRd<RdContactRaw>("/contacts", "contacts", token, { maxPages });

export const fetchRdDeals = (token: string, maxPages = 45) =>
  fetchAllRd<RdDealRaw>("/deals", "deals", token, { maxPages });

export function contactEmail(c: RdContactRaw): string | null {
  return c.emails?.find((e) => e.email)?.email?.trim().toLowerCase() ?? null;
}

export function contactPhone(c: RdContactRaw): string | null {
  return c.phones?.find((p) => p.phone)?.phone?.trim() ?? null;
}

export function dealAmount(d: RdDealRaw): number | null {
  const raw = d.amount_total ?? d.amount_unique;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function dealStatus(d: RdDealRaw): "won" | "lost" | "open" {
  if (d.win === true) return "won";
  if (d.win === false && d.closed_at) return "lost";
  return "open";
}
