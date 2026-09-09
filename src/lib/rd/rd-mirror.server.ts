import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRdTokenInfo } from "@/lib/rd-token.server";
import {
  findField,
  rdId,
  rdGet,
  type Json,
  type RdContactRaw,
  type RdCustomField,
  type RdDealRaw,
  type RdOrganizationRaw,
} from "./rd-api.server";

/*
 * Espelho do RD em fatias. Cada chamada lê poucas páginas do RD e grava no
 * staging (rd_organizations / rd_contacts / rd_deals) — pequena o bastante
 * para caber no limite de tempo e de sub-requisições de uma requisição do
 * worker. Um orquestrador externo (curl, script) encadeia as fatias.
 *
 * Organizações e contatos: varredura por ordenação (order/direction) e
 * página — o RD limita cada ordenação a 50 páginas × 200, então o chamador
 * percorre as seis ordenações e, em contatos, as buscas por letra.
 * Negócios: cursor next_page, sem teto.
 */

export type MirrorSlice =
  | {
      resource: "organizations" | "contacts";
      order?: string;
      direction?: string;
      q?: string;
      from?: number;
      to?: number;
    }
  | { resource: "deals"; next?: string | null; pages?: number };

export interface MirrorSliceResult {
  resource: string;
  fetched: number;
  saved: number;
  total: number | null;
  hasMore: boolean;
  nextPage?: string | null;
  lastPage?: number;
}

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .trim();
const now = () => new Date().toISOString();

function orgFields(o: RdOrganizationRaw): RdCustomField[] {
  return [...(o.organization_custom_fields ?? []), ...(o.custom_fields ?? [])];
}
export function orgRow(o: RdOrganizationRaw) {
  const cnpj = (findField(orgFields(o), "cnpj") ?? "").replace(/\D/g, "");
  const lifecycle = findField(orgFields(o), "[grou] ciclo de vida", "ciclo de vida");
  return {
    rd_id: rdId(o) as string,
    name: clean(o.name),
    lifecycle: lifecycle ? clean(lifecycle) || null : null,
    cnpj: cnpj.length >= 11 ? cnpj : null,
    site_url: clean(o.url ?? o.website ?? o.site) || null,
    segment: clean(typeof o.segment === "string" ? o.segment : o.segment?.name) || null,
    owner_name: o.user?.name ?? o.user?.email ?? null,
    raw: o as never,
    synced_at: now(),
  };
}
export function contactRow(c: RdContactRaw) {
  return {
    rd_id: rdId(c) as string,
    name: clean(c.name),
    email: clean(c.emails?.[0]?.email).toLowerCase() || null,
    phone: clean(c.phones?.[0]?.phone) || null,
    position: c.title ?? c.job_title ?? null,
    linkedin_url: c.linkedin ?? null,
    rd_org_id: rdId(c.organization ?? undefined) ?? c.organization_id ?? null,
    rd_org_name: c.organization?.name ?? null,
    owner_name: c.user?.name ?? c.user?.email ?? null,
    raw: c as never,
    synced_at: now(),
  };
}
export function dealRow(d: RdDealRaw) {
  return {
    rd_id: rdId(d) as string,
    name: clean(d.name) || "Sem nome",
    pipeline: clean(d.deal_pipeline?.name ?? d.deal_stage?.deal_pipeline?.name) || null,
    stage: clean(d.deal_stage?.name) || null,
    amount: Number(d.amount_total ?? d.amount_unique ?? 0) || null,
    status: d.win === true ? "won" : d.win === false ? "lost" : "open",
    rd_org_id: rdId(d.organization ?? undefined),
    rd_org_name: d.organization?.name ?? null,
    rd_contact_id: rdId(d.contacts?.[0] ?? undefined),
    owner_name: d.user?.name ?? d.user?.email ?? null,
    source_name:
      d.deal_source?.name ?? (typeof d.source === "string" ? d.source : d.source?.name) ?? null,
    campaign_name: d.campaign?.name ?? null,
    rd_created_at: d.created_at ?? null,
    raw: d as never,
    synced_at: now(),
  };
}

async function upsert(table: "rd_organizations" | "rd_contacts" | "rd_deals", rows: Json[]) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const part = rows.slice(i, i + 300);
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(part as never, { onConflict: "rd_id" });
    if (error) throw new Error(`${table}: ${error.message}`);
    saved += part.length;
  }
  return saved;
}

export async function mirrorSlice(slice: MirrorSlice): Promise<MirrorSliceResult> {
  const { token } = await getRdTokenInfo();
  if (!token) throw new Error("RD Station não conectado.");

  if (slice.resource === "deals") {
    const pages = Math.min(Math.max(slice.pages ?? 8, 1), 25);
    let next: string | null = slice.next ?? null;
    let total: number | null = null;
    const rows: Json[] = [];
    let hasMore = true;
    for (let i = 0; i < pages; i++) {
      const json = await rdGet(
        "/deals",
        next ? { next_page: next, limit: "200" } : { page: "1", limit: "200" },
        token,
      );
      if (typeof json.total === "number") total = json.total as number;
      const batch = (json.deals ?? []) as RdDealRaw[];
      for (const d of batch) if (rdId(d)) rows.push(dealRow(d) as never);
      next = (json.next_page as string | undefined) ?? null;
      if (!next || batch.length === 0) {
        hasMore = false;
        break;
      }
    }
    const saved = await upsert("rd_deals", rows);
    return {
      resource: "deals",
      fetched: rows.length,
      saved,
      total,
      hasMore,
      nextPage: hasMore ? next : null,
    };
  }

  const from = Math.max(slice.from ?? 1, 1);
  const to = Math.min(Math.max(slice.to ?? from + 7, from), 50);
  const base: Record<string, string> = {};
  if (slice.q) base.q = slice.q;
  else {
    base.order = slice.order ?? "created_at";
    base.direction = slice.direction ?? "asc";
  }
  const key = slice.resource;
  const rows: Json[] = [];
  let total: number | null = null;
  let hasMore = true;
  let lastPage = from - 1;
  for (let page = from; page <= to; page++) {
    let json: Json;
    try {
      json = await rdGet(`/${key}`, { ...base, page: String(page), limit: "200" }, token);
    } catch {
      hasMore = false; // teto de 50 páginas / erro do RD
      break;
    }
    lastPage = page;
    if (typeof json.total === "number") total = json.total as number;
    const batch = (json[key] ?? []) as Json[];
    for (const r of batch) {
      if (!rdId(r as never)) continue;
      rows.push(
        (key === "organizations"
          ? orgRow(r as RdOrganizationRaw)
          : contactRow(r as RdContactRaw)) as never,
      );
    }
    if (json.has_more === false || batch.length === 0) {
      hasMore = false;
      break;
    }
  }
  if (lastPage >= 50) hasMore = false;
  const saved = await upsert(key === "organizations" ? "rd_organizations" : "rd_contacts", rows);
  return { resource: key, fetched: rows.length, saved, total, hasMore, lastPage };
}

/** Contagem do staging, para o orquestrador saber quando parar. */
export async function mirrorCounts() {
  const count = async (t: "rd_organizations" | "rd_contacts" | "rd_deals") => {
    const { count: n } = await supabaseAdmin
      .from(t)
      .select("rd_id", { count: "exact", head: true });
    return n ?? 0;
  };
  return {
    organizations: await count("rd_organizations"),
    contacts: await count("rd_contacts"),
    deals: await count("rd_deals"),
  };
}
