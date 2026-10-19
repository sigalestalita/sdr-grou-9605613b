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
  organization_id?: string;

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
  if (Array.isArray(v))
    return v
      .map((x) => String(x))
      .join(", ")
      .trim();
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

/*
 * O RD limita cada consulta a 50 páginas × 200 = 10.000 registros. Para ir além,
 * a coleção é varrida em várias ordenações (cada uma alcança um "lado" diferente
 * do conjunto) e os registros são deduplicados por id. Contatos que sobrarem são
 * buscados por letra (`q`), que o RD casa por substring. Negócios têm cursor
 * (`next_page`) e não precisam de nada disso.
 */
const PASSES: Array<Record<string, string>> = [
  { order: "created_at", direction: "asc" },
  { order: "created_at", direction: "desc" },
  { order: "name", direction: "asc" },
  { order: "name", direction: "desc" },
  { order: "updated_at", direction: "asc" },
  { order: "updated_at", direction: "desc" },
];

const RD_PAGE_CAP = 50;
const Q_BUCKETS = "bcdfghjklmnpqrstvwxyz".split("");

/** Varredura completa de uma coleção paginada do RD, sem duplicar registros. */
export async function fetchAllRd<T extends { _id?: string; id?: string }>(
  path: string,
  collectionKey: string,
  token: string,
  opts?: {
    maxPages?: number;
    extraParams?: Record<string, string>;
    onProgress?: (n: number, total: number | null) => void;
  },
): Promise<T[]> {
  const maxPages = Math.min(opts?.maxPages ?? RD_PAGE_CAP, RD_PAGE_CAP);
  const out: T[] = [];
  const seen = new Set<string>();
  let total: number | null = null;

  const sweep = async (params: Record<string, string>) => {
    for (let page = 1; page <= maxPages; page++) {
      let json: Json;
      try {
        json = await rdGet(
          path,
          { ...(opts?.extraParams ?? {}), ...params, page: String(page), limit: "200" },
          token,
        );
      } catch {
        break; // além do teto o RD responde 400
      }
      if (typeof json.total === "number") total = json.total as number;
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
      opts?.onProgress?.(out.length, total);
      if (json.has_more === false) break;
      if (total !== null && out.length >= total) break;
      if (novos === 0 && page > 3) break;
    }
  };

  const complete = () => total !== null && out.length >= total;

  // Negócios: cursor sem teto.
  if (collectionKey === "deals") {
    let next: string | null = null;
    for (let i = 0; i < 1000; i++) {
      let json: Json;
      try {
        json = await rdGet(
          path,
          {
            ...(opts?.extraParams ?? {}),
            ...(next ? { next_page: next } : { page: "1" }),
            limit: "200",
          },
          token,
        );
      } catch {
        break;
      }
      if (typeof json.total === "number") total = json.total as number;
      const rows = (json[collectionKey] ?? []) as T[];
      for (const r of rows) {
        const id = rdId(r);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(r);
      }
      opts?.onProgress?.(out.length, total);
      if (!json.next_page || rows.length === 0 || complete()) break;
      next = String(json.next_page);
    }
    return out;
  }

  for (const pass of PASSES) {
    await sweep(pass);
    if (complete()) return out;
  }

  // Contatos que ficaram no "meio" de todas as ordenações: busca por letra.
  if (collectionKey === "contacts" && !complete()) {
    for (const q of Q_BUCKETS) {
      await sweep({ q });
      if (complete()) break;
    }
  }
  return out;
}

export const fetchRdOrganizations = (token: string, maxPages = RD_PAGE_CAP) =>
  fetchAllRd<RdOrganizationRaw>("/organizations", "organizations", token, { maxPages });

export const fetchRdContacts = (token: string, maxPages = RD_PAGE_CAP) =>
  fetchAllRd<RdContactRaw>("/contacts", "contacts", token, { maxPages });

export const fetchRdDeals = (token: string, maxPages = RD_PAGE_CAP) =>
  fetchAllRd<RdDealRaw>("/deals", "deals", token, { maxPages });

export function contactEmail(c: RdContactRaw): string | null {
  return (
    c.emails
      ?.find((e) => e.email)
      ?.email?.trim()
      .toLowerCase() ?? null
  );
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

export interface RdAtividade {
  _id?: string;
  id?: string;
  text?: string;
  subject?: string;
  type?: string;
  activity_kind?: string;
  date?: string;
  created_at?: string;
  user?: { name?: string; email?: string };
}

/**
 * Anotações e atividades de um negócio (o RD expõe as duas por rotas
 * diferentes; a mesma atividade pode vir nas duas, por isso o id dedupe).
 * Erro de rede ou 404 vira lista vazia; 429 (limite) sobe, para a fatia parar.
 */
export async function fetchDealHistorico(token: string, dealId: string): Promise<RdAtividade[]> {
  const out = new Map<string, RdAtividade>();
  for (const [rota, chave] of [
    ["activities", "activities"],
    ["notes", "notes"],
  ] as const) {
    const qs = new URLSearchParams({ token }).toString();
    const res = await fetch(`${RD_BASE}/deals/${encodeURIComponent(dealId)}/${rota}?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("RD 429: limite de requisições, tente em 1 minuto");
    if (!res.ok) continue;
    const json = (await res.json()) as Record<string, RdAtividade[] | undefined>;
    for (const a of json[chave] ?? []) {
      const id = rdId(a);
      if (id) out.set(id, a);
    }
  }
  return [...out.values()];
}

export type MapaDeFunis = {
  /** id do funil → nome */
  porFunil: Map<string, string>;
  /** id da etapa → nome do funil */
  porEtapa: Map<string, string>;
};

/**
 * Funis e etapas do RD. A listagem de negócios traz a etapa (id e nome), mas
 * nem sempre o funil: o nome do funil vem daqui, pelo id da etapa.
 */
export async function fetchMapaDeFunis(token: string): Promise<MapaDeFunis> {
  const porFunil = new Map<string, string>();
  const porEtapa = new Map<string, string>();
  const json = (await rdGet("/deal_pipelines", {}, token)) as unknown;
  const funis = (Array.isArray(json) ? json : ((json as Json).deal_pipelines ?? [])) as Array<
    Json & { _id?: string; id?: string; name?: string; deal_stages?: Json[] }
  >;
  for (const f of funis) {
    const id = rdId(f);
    const nome = String(f.name ?? "").trim();
    if (!id || !nome) continue;
    porFunil.set(id, nome);
    let etapas = f.deal_stages;
    if (!etapas) {
      const e = (await rdGet(
        "/deal_stages",
        { deal_pipeline_id: id, limit: "200" },
        token,
      )) as unknown;
      etapas = (Array.isArray(e) ? e : ((e as Json).deal_stages ?? [])) as Json[];
    }
    for (const s of etapas ?? []) {
      const sid = rdId(s as { _id?: string; id?: string });
      if (sid) porEtapa.set(sid, nome);
    }
  }
  return { porFunil, porEtapa };
}

/** Nome do funil de um negócio: o que vier no próprio negócio, ou pelo mapa. */
export function funilDoNegocio(d: RdDealRaw, mapa?: MapaDeFunis | null): string | null {
  const direto = (d.deal_pipeline?.name ?? d.deal_stage?.deal_pipeline?.name ?? "").trim();
  if (direto) return direto;
  if (!mapa) return null;
  const raw = d as RdDealRaw & { deal_pipeline_id?: string };
  const idFunil = rdId(d.deal_pipeline ?? undefined) ?? raw.deal_pipeline_id ?? null;
  if (idFunil && mapa.porFunil.has(idFunil)) return mapa.porFunil.get(idFunil)!;
  const idEtapa = rdId(d.deal_stage ?? undefined);
  return (idEtapa && mapa.porEtapa.get(idEtapa)) || null;
}
