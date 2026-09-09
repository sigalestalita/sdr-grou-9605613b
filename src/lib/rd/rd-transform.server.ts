import { supabaseAdmin } from "@/integrations/supabase/client.server";
import fieldMap from "../../../docs/rd-field-map.json";
import { rdId, type Json, type RdCustomField } from "./rd-api.server";

/*
 * Transformação staging → objetos (onda 2).
 *
 * Lê rd_organizations / rd_contacts / rd_deals (espelho cru do RD, mantido
 * pelo sync do Lovable) e projeta em companies / contacts / deals segundo
 * docs/rd-field-map.json. Regras:
 *
 *  - Idempotente: cada objeto guarda o rd_id de origem; rodar de novo só
 *    atualiza. Empresas sem rd_id (vindas do CS) são ligadas por CNPJ,
 *    domínio ou nome normalizado — chaves exatas; o resto vai para a
 *    fila dedupe_candidates, nunca é fundido sozinho.
 *  - Origem por campo: provenance[campo] = 'rd' | 'manual' | …. A
 *    transformação nunca sobrescreve um campo marcado 'manual'.
 *  - O mapeamento é configuração: mudou o JSON, roda de novo.
 */

type MapEntry = {
  rd: string;
  type: string;
  fill: number;
  action: "column" | "merge" | "tag" | "derived" | "history" | "contact" | "drop";
  target?: string;
  values?: Record<string, string>;
  merge_with?: string[];
  note?: string;
};
type FieldMap = { organization: MapEntry[]; contact: MapEntry[]; deal: MapEntry[] };
const MAP = fieldMap as unknown as FieldMap;

export interface RdTransformResult {
  companies: { total: number; created: number; updated: number; linkedByKey: number };
  contacts: { total: number; created: number; updated: number; semEmpresa: number };
  deals: { total: number; created: number; updated: number; wonFromStage: number };
  products: number;
  dedupe: { company: number; parent: number };
  errors: string[];
  dryRun: boolean;
}

type Row = Record<string, unknown>;
const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .trim();
const norm = (s: unknown) =>
  clean(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const digits = (s: unknown) => clean(s).replace(/\D/g, "");
const domainOf = (s: unknown) => {
  const v = clean(s)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  const d = v.split(/[/?#]/)[0] ?? "";
  return d.includes(".") ? d : null;
};
const emailDomain = (e: string | null) => {
  const d = (e ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (!d || /gmail|hotmail|outlook|yahoo|icloud|live\.|uol\.|bol\.|terra\./.test(d)) return null;
  return d;
};
/** dd/mm/aaaa ou ISO → aaaa-mm-dd. */
const toDate = (s: unknown): string | null => {
  const v = clean(s);
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
};
const toNumber = (s: unknown): number | null => {
  const v = clean(s)
    .replace(/[R$\s.]/g, "")
    .replace(",", ".");
  const n = Number(v);
  return v && Number.isFinite(n) ? n : null;
};

/** {label: valor} dos campos customizados de um registro cru do RD. */
function customFields(raw: Json): Record<string, string> {
  const list = [
    ...((raw.custom_fields as RdCustomField[] | undefined) ?? []),
    ...((raw.organization_custom_fields as RdCustomField[] | undefined) ?? []),
    ...((raw.contact_custom_fields as RdCustomField[] | undefined) ?? []),
    ...((raw.deal_custom_fields as RdCustomField[] | undefined) ?? []),
  ];
  const out: Record<string, string> = {};
  for (const f of list) {
    const label = clean(f.custom_field?.label ?? f.label ?? "");
    let v: unknown = f.value;
    if (v == null) v = "";
    else if (Array.isArray(v))
      v = v
        .map((x) => (typeof x === "object" && x ? ((x as Json).name ?? "") : String(x)))
        .join(", ");
    else if (typeof v === "object") v = String((v as Json).name ?? "");
    const s = clean(v);
    if (label && s) out[label] = s;
  }
  return out;
}

/**
 * Aplica o mapeamento a um registro: devolve {tabela: {coluna: valor}} com o
 * primeiro valor não vazio por destino (coluna antes de fusão, maior
 * preenchimento antes).
 */
function project(
  entries: MapEntry[],
  cf: Record<string, string>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const order = [...entries]
    .filter((e) => e.target && ["column", "merge", "history", "derived"].includes(e.action))
    .sort(
      (a, b) =>
        (a.action === "column" ? 0 : 1) - (b.action === "column" ? 0 : 1) || b.fill - a.fill,
    );
  for (const e of order) {
    const rawVal = cf[e.rd];
    if (!rawVal) continue;
    const [table, col] = (e.target as string).split(".");
    if (!table || !col) continue;
    out[table] ??= {};
    if (out[table][col] != null && out[table][col] !== "") continue;
    let v: unknown = clean(rawVal);
    if (e.values) {
      const hit = Object.entries(e.values).find(([k]) => norm(k) === norm(rawVal));
      if (hit) v = hit[1];
      else if (e.action === "column" && Object.keys(e.values).length > 0) continue; // opção desconhecida
    }
    if (e.type === "date") v = toDate(v);
    else if (e.type === "number") v = col === "cnpj" ? digits(v) : toNumber(v);
    else if (col === "cnpj") v = digits(v).length >= 11 ? digits(v) : null;
    if (v == null || v === "") continue;
    out[table][col] = v;
  }
  return out;
}

/** Mescla valores projetados num registro existente respeitando provenance 'manual'. */
function applyWithProvenance(
  existing: Row | null,
  incoming: Record<string, unknown>,
  source = "rd",
) {
  const prov = {
    ...(((existing?.provenance as Record<string, string>) ?? {}) as Record<string, string>),
  };
  const patch: Row = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (prov[k] === "manual") continue;
    if (existing && existing[k] === v) continue;
    patch[k] = v;
    prov[k] = source;
  }
  if (Object.keys(patch).length > 0) patch.provenance = prov;
  return patch;
}

function userMatcher(profiles: { id: string; full_name: string | null; email: string | null }[]) {
  const byNorm = new Map<string, string>();
  for (const p of profiles) {
    if (p.full_name) byNorm.set(norm(p.full_name), p.id);
    if (p.email) byNorm.set(p.email.toLowerCase(), p.id);
  }
  return (name: unknown): string | null => {
    const n = norm(name);
    if (!n || /desativad/.test(n)) return null;
    if (byNorm.has(n)) return byNorm.get(n)!;
    // primeiro + último nome
    const parts = n.split(" ");
    if (parts.length >= 2) {
      const key = `${parts[0]} ${parts[parts.length - 1]}`;
      for (const [k, id] of byNorm) {
        const kp = k.split(" ");
        if (kp.length >= 2 && `${kp[0]} ${kp[kp.length - 1]}` === key) return id;
      }
    }
    for (const [k, id] of byNorm) if (k.startsWith(parts[0] + " ") && parts.length === 1) return id;
    return null;
  };
}

async function fetchAll<T = Row>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; from < 200000; from += size) {
    const { data, error } = await supabaseAdmin
      .from(table as never)
      .select(select)
      .range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

const RD_PIPELINE_TO_SLUG: Array<[RegExp, string]> = [
  [/cross/i, "cross-sell-cliente"],
  [/up ?sell|recompra/i, "up-sell-recompra"],
  [/indica/i, "indicacao"],
];

export async function transformRdToObjects(opts?: {
  dryRun?: boolean;
  only?: Array<"companies" | "contacts" | "deals" | "parents">;
  /** Fatia do staging (por recurso): pula offset linhas e processa até limit. */
  offset?: number;
  limit?: number;
}): Promise<RdTransformResult> {
  const dryRun = !!opts?.dryRun;
  const only = new Set(opts?.only ?? ["companies", "contacts", "deals", "parents"]);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : null;
  const slice = <T>(rows: T[]) => (limit ? rows.slice(offset, offset + limit) : rows);
  const errors: string[] = [];
  const result: RdTransformResult = {
    companies: { total: 0, created: 0, updated: 0, linkedByKey: 0 },
    contacts: { total: 0, created: 0, updated: 0, semEmpresa: 0 },
    deals: { total: 0, created: 0, updated: 0, wonFromStage: 0 },
    products: 0,
    dedupe: { company: 0, parent: 0 },
    errors,
    dryRun,
  };

  const profiles = await fetchAll<{ id: string; full_name: string | null; email: string | null }>(
    "profiles",
    "id, full_name, email",
  );
  const userOf = userMatcher(profiles);

  // ------------------------------------------------------------ empresas
  const existingCompanies = await fetchAll(
    "companies",
    "id, uid, rd_org_id, cnpj, dominio, nome, nome_normalizado, parent_company_id, provenance",
  );
  const byRd = new Map<string, Row>();
  const byCnpj = new Map<string, Row>();
  const byDomain = new Map<string, Row>();
  const byName = new Map<string, Row>();
  const indexCompany = (c: Row) => {
    if (c.rd_org_id) byRd.set(String(c.rd_org_id), c);
    if (c.cnpj) byCnpj.set(String(c.cnpj), c);
    if (c.dominio) byDomain.set(String(c.dominio).toLowerCase(), c);
    if (c.nome_normalizado) byName.set(String(c.nome_normalizado), c);
  };
  existingCompanies.forEach(indexCompany);

  const rdOrgs = only.has("companies")
    ? slice(
        await fetchAll("rd_organizations", "rd_id, name, cnpj, site_url, segment, owner_name, raw"),
      )
    : [];
  const orgToCompany = new Map<string, string>(); // rd_org_id -> companies.id

  if (only.has("companies")) {
    result.companies.total = rdOrgs.length;
    const inserts: Row[] = [];
    const updates: Array<{ id: string; patch: Row }> = [];
    for (const o of rdOrgs) {
      const raw = (o.raw ?? {}) as Json;
      const cf = customFields(raw);
      const proj = project(MAP.organization, cf);
      const fields: Row = {
        nome: clean(o.name),
        ...(proj.companies ?? {}),
      };
      const site = clean(o.site_url) || null;
      if (site && !fields.site_url) fields.site_url = site;
      const dom = domainOf(fields.dominio ?? site);
      if (dom) fields.dominio = dom;
      if (!fields.segmento && o.segment) fields.segmento = clean(o.segment);
      if (!fields.cnpj && o.cnpj) fields.cnpj = digits(o.cnpj);
      if (fields.cnpj && String(fields.cnpj).length < 11) delete fields.cnpj;
      // derivados do playbook
      const analista = cf["[Grou] Possui Analista PDA"] ?? cf["Possui Analista PDA?"];
      if (analista && /^sim$/i.test(analista)) fields.analista_pda_declarado = true;
      if (cf["RFM"]) fields.rfm_seed = clean(cf["RFM"]);
      if (cf["[Grou] SDR"]) {
        fields.sdr_original = clean(cf["[Grou] SDR"]);
        const u = userOf(cf["[Grou] SDR"]);
        if (u) fields.sdr_user_id = u;
      }
      if (o.owner_name) {
        fields.owner_original = clean(o.owner_name);
        const u = userOf(o.owner_name);
        if (u) fields.owner_user_id = u;
      }
      fields.rd_org_id = String(o.rd_id);

      const key = String(o.rd_id);
      let existing = byRd.get(key) ?? null;
      if (!existing) {
        existing =
          (fields.cnpj ? byCnpj.get(String(fields.cnpj)) : undefined) ??
          (fields.dominio ? byDomain.get(String(fields.dominio)) : undefined) ??
          byName.get(norm(o.name)) ??
          null;
        if (existing) result.companies.linkedByKey++;
      }
      if (existing) {
        if (existing.rd_org_id && existing.rd_org_id !== key) {
          // já ligada a outra organização do RD: candidata a duplicata, não sobrescrever
          continue;
        }
        const patch = applyWithProvenance(existing, fields);
        if (Object.keys(patch).length > 0) updates.push({ id: String(existing.id), patch });
        orgToCompany.set(key, String(existing.id));
        if (!existing.rd_org_id) {
          existing.rd_org_id = key;
          byRd.set(key, existing);
        }
      } else {
        const prov: Record<string, string> = {};
        for (const k of Object.keys(fields)) prov[k] = "rd";
        inserts.push({ ...fields, provenance: prov });
      }
    }
    if (!dryRun) {
      for (const part of chunk(inserts, 400)) {
        const { data, error } = await supabaseAdmin
          .from("companies")
          .insert(part as never)
          .select("id, rd_org_id, cnpj, dominio, nome_normalizado");
        if (error) errors.push(`companies insert: ${error.message}`);
        else {
          result.companies.created += part.length;
          for (const c of (data ?? []) as Row[]) {
            indexCompany(c);
            if (c.rd_org_id) orgToCompany.set(String(c.rd_org_id), String(c.id));
          }
        }
      }
      for (const part of chunk(updates, 200)) {
        await Promise.all(
          part.map(async ({ id, patch }) => {
            const { error } = await supabaseAdmin
              .from("companies")
              .update(patch as never)
              .eq("id", id);
            if (error) errors.push(`companies update ${id}: ${error.message}`);
            else result.companies.updated++;
          }),
        );
      }
    } else {
      result.companies.created = inserts.length;
      result.companies.updated = updates.length;
    }
  } else {
    for (const c of existingCompanies)
      if (c.rd_org_id) orgToCompany.set(String(c.rd_org_id), String(c.id));
  }

  // Candidatas a mãe → filha: "Sicredi Sul SC - 2604" tem mãe "Sicredi" quando ela existe.
  if (only.has("parents") && !dryRun) {
    const all = await fetchAll("companies", "id, nome, nome_normalizado, parent_company_id");
    const exact = new Map(all.map((c) => [String(c.nome_normalizado), c]));
    const groups = new Map<string, Row[]>();
    for (const c of all) {
      const first = String(c.nome_normalizado).split(" ")[0];
      if (!first || first.length < 4) continue;
      groups.set(first, [...(groups.get(first) ?? []), c]);
    }
    const candidates: Row[] = [];
    for (const [first, members] of groups) {
      const mae = exact.get(first);
      if (!mae || members.length < 3) continue;
      for (const m of members) {
        if (m.id === mae.id || m.parent_company_id) continue;
        candidates.push({
          kind: "parent",
          left_id: mae.id,
          right_id: m.id,
          motivo: `"${m.nome}" parece unidade de "${mae.nome}"`,
          score: 0.7,
        });
      }
    }
    for (const part of chunk(candidates, 400)) {
      const { error } = await supabaseAdmin
        .from("dedupe_candidates")
        .upsert(part as never, { onConflict: "kind,left_id,right_id", ignoreDuplicates: true });
      if (error) errors.push(`dedupe parent: ${error.message}`);
      else result.dedupe.parent += part.length;
    }
  }

  // ------------------------------------------------------------ contatos
  const contactByRd = new Map<string, string>();
  if (only.has("contacts")) {
    const existingContacts = await fetchAll(
      "contacts",
      "id, rd_contact_id, email, company_id, provenance",
    );
    const byRdC = new Map(
      existingContacts.filter((c) => c.rd_contact_id).map((c) => [String(c.rd_contact_id), c]),
    );
    const rdContacts = slice(
      await fetchAll(
        "rd_contacts",
        "rd_id, name, email, phone, position, linkedin_url, rd_org_id, owner_name, raw",
      ),
    );
    result.contacts.total = rdContacts.length;
    const inserts: Row[] = [];
    const updates: Array<{ id: string; patch: Row }> = [];
    for (const c of rdContacts) {
      const raw = (c.raw ?? {}) as Json;
      const cf = customFields(raw);
      const proj = project(MAP.contact, cf);
      const emails = ((raw.emails as Array<{ email?: string }> | undefined) ?? [])
        .map((e) => clean(e.email).toLowerCase())
        .filter(Boolean);
      const phones = ((raw.phones as Array<{ phone?: string }> | undefined) ?? [])
        .map((p) => clean(p.phone))
        .filter(Boolean);
      const fields: Row = {
        nome: clean(c.name),
        email: emails[0] ?? (clean(c.email).toLowerCase() || null),
        emails,
        telefone: phones[0] ?? (clean(c.phone) || null),
        phones,
        linkedin_url: clean(c.linkedin_url) || null,
        rd_contact_id: String(c.rd_id),
        ...(proj.contacts ?? {}),
      };
      if (!fields.cargo && c.position) fields.cargo = clean(c.position);
      const analista =
        cf["É analista PDA?"] ?? cf["Analista PDA?"] ?? cf["Analista PDA GROU Academy"];
      if (analista && /^sim$/i.test(analista)) fields.analista_pda = true;
      if (cf["[Grou] SDR"]) {
        fields.sdr_original = clean(cf["[Grou] SDR"]);
        const u = userOf(cf["[Grou] SDR"]);
        if (u) fields.sdr_user_id = u;
      }
      if (c.owner_name) fields.owner_original = clean(c.owner_name);
      const companyId = c.rd_org_id ? orgToCompany.get(String(c.rd_org_id)) : undefined;
      if (companyId) fields.company_id = companyId;
      else result.contacts.semEmpresa++;
      // empresa por domínio do e-mail quando o RD não vincula
      if (!companyId) {
        const d = emailDomain(fields.email as string | null);
        const hit = d ? byDomain.get(d) : undefined;
        if (hit) fields.company_id = hit.id;
      }

      const existing = byRdC.get(String(c.rd_id)) ?? null;
      if (existing) {
        const patch = applyWithProvenance(existing, fields);
        if (Object.keys(patch).length > 0) updates.push({ id: String(existing.id), patch });
        contactByRd.set(String(c.rd_id), String(existing.id));
      } else {
        const prov: Record<string, string> = {};
        for (const k of Object.keys(fields)) prov[k] = "rd";
        inserts.push({ ...fields, provenance: prov });
      }
    }
    if (!dryRun) {
      for (const part of chunk(inserts, 400)) {
        const { data, error } = await supabaseAdmin
          .from("contacts")
          .insert(part as never)
          .select("id, rd_contact_id, company_id");
        if (error) errors.push(`contacts insert: ${error.message}`);
        else {
          result.contacts.created += part.length;
          for (const r of (data ?? []) as Row[])
            if (r.rd_contact_id) contactByRd.set(String(r.rd_contact_id), String(r.id));
        }
      }
      for (const part of chunk(updates, 200)) {
        await Promise.all(
          part.map(async ({ id, patch }) => {
            const { error } = await supabaseAdmin
              .from("contacts")
              .update(patch as never)
              .eq("id", id);
            if (error) errors.push(`contacts update ${id}: ${error.message}`);
            else result.contacts.updated++;
          }),
        );
      }
      // associação contato ↔ empresa principal
      const links = await fetchAll("contacts", "id, company_id");
      const rows = links
        .filter((l) => l.company_id)
        .map((l) => ({ company_id: l.company_id, contact_id: l.id, principal: true }));
      for (const part of chunk(rows, 500)) {
        const { error } = await supabaseAdmin
          .from("company_contacts")
          .upsert(part as never, { onConflict: "company_id,contact_id", ignoreDuplicates: true });
        if (error) errors.push(`company_contacts: ${error.message}`);
      }
    } else {
      result.contacts.created = inserts.length;
      result.contacts.updated = updates.length;
    }
  } else {
    const ex = await fetchAll("contacts", "id, rd_contact_id");
    for (const c of ex) if (c.rd_contact_id) contactByRd.set(String(c.rd_contact_id), String(c.id));
  }

  // ------------------------------------------------------------ negócios
  if (only.has("deals")) {
    const pipelines = await fetchAll("pipelines", "id, slug");
    const stages = await fetchAll("pipeline_stages", "id, pipeline_id, slug, nome, kind, ordem");
    const pipeBySlug = new Map(pipelines.map((p) => [String(p.slug), String(p.id)]));
    const stagesOf = (pipelineId: string) =>
      stages
        .filter((s) => s.pipeline_id === pipelineId)
        .sort((a, b) => Number(a.ordem) - Number(b.ordem));
    const pickStage = (pipelineId: string, status: string, rdStage: string | null) => {
      const list = stagesOf(pipelineId);
      if (status === "won") return list.find((s) => s.kind === "won")?.id ?? null;
      if (status === "lost") return list.find((s) => s.kind === "lost")?.id ?? null;
      const n = norm(rdStage);
      const hit = n
        ? list.find(
            (s) =>
              s.kind === "open" &&
              (norm(s.nome) === n || n.includes(norm(s.nome)) || norm(s.nome).includes(n)),
          )
        : undefined;
      return (hit ?? list.find((s) => s.kind === "open"))?.id ?? null;
    };

    const existingDeals = await fetchAll("deals", "id, rd_deal_id, provenance");
    const byRdD = new Map(
      existingDeals.filter((d) => d.rd_deal_id).map((d) => [String(d.rd_deal_id), d]),
    );
    const existingProducts = await fetchAll("products", "id, nome");
    const productByName = new Map(existingProducts.map((p) => [norm(p.nome), String(p.id)]));
    const rdDeals = slice(
      await fetchAll(
        "rd_deals",
        "rd_id, name, pipeline, stage, amount, status, rd_org_id, rd_contact_id, owner_name, source_name, campaign_name, rd_created_at, raw",
      ),
    );
    result.deals.total = rdDeals.length;

    // catálogo de produtos
    const newProducts = new Map<string, string>();
    for (const d of rdDeals) {
      const raw = (d.raw ?? {}) as Json;
      for (const p of (raw.deal_products as
        | Array<{ name?: string; product?: { name?: string } }>
        | undefined) ?? []) {
        const nome = clean(p.name ?? p.product?.name);
        if (nome && !productByName.has(norm(nome))) newProducts.set(norm(nome), nome);
      }
    }
    if (!dryRun && newProducts.size > 0) {
      const rows = [...newProducts.values()].map((nome) => ({ nome }));
      for (const part of chunk(rows, 400)) {
        const { data, error } = await supabaseAdmin
          .from("products")
          .upsert(part as never, { onConflict: "nome" })
          .select("id, nome");
        if (error) errors.push(`products: ${error.message}`);
        else for (const r of (data ?? []) as Row[]) productByName.set(norm(r.nome), String(r.id));
      }
    }
    result.products = productByName.size;

    const inserts: Row[] = [];
    const updates: Array<{ id: string; patch: Row }> = [];
    const productLines = new Map<string, Row[]>(); // rd_deal_id -> linhas
    const contactLinks = new Map<string, string[]>(); // rd_deal_id -> contact ids
    for (const d of rdDeals) {
      const raw = (d.raw ?? {}) as Json;
      const cf = customFields(raw);
      const proj = project(MAP.deal, cf);
      const dealProj = proj.deals ?? {};
      let status = String(d.status ?? "open");
      // 10.558 negócios "abertos" na etapa Venda são vendas ganhas que a migração não marcou.
      if (status === "open" && /^venda$/i.test(clean(d.stage))) {
        status = "won";
        result.deals.wonFromStage++;
      }
      const tipoVenda = String(dealProj.tipo_venda ?? "");
      let slug = "novos-negocios";
      for (const [re, s] of RD_PIPELINE_TO_SLUG)
        if (re.test(tipoVenda) || re.test(String(d.pipeline ?? ""))) {
          slug = s;
          break;
        }
      const pipelineId = pipeBySlug.get(slug) ?? null;
      const amountRd = Number(d.amount ?? 0);
      const amountBackup = toNumber(cf["[backup] Valor"]);
      const fields: Row = {
        nome: clean(d.name) || "Sem nome",
        status,
        amount: amountRd > 0 ? amountRd : (amountBackup ?? 0),
        closed_at: status !== "open" ? ((raw.closed_at as string | null) ?? null) : null,
        rd_deal_id: String(d.rd_id),
        rd_pipeline: clean(d.pipeline) || null,
        rd_stage: clean(d.stage) || null,
        fonte: clean(d.source_name) || null,
        campanha: clean(d.campaign_name) || null,
        pipeline_id: pipelineId,
        stage_id: pipelineId ? pickStage(pipelineId, status, clean(d.stage) || null) : null,
        ...dealProj,
      };
      if (d.owner_name) {
        fields.owner_original = clean(d.owner_name);
        const u = userOf(d.owner_name);
        if (u) fields.owner_user_id = u;
      }
      for (const [col, label] of [
        ["sdr_user_id", "SDR responsável"],
        ["executivo_user_id", "Executivo Responsável"],
        ["devolutiva_user_id", "[CS] Devolutiva PDA Prospect"],
      ] as const) {
        const u = cf[label] ? userOf(cf[label]) : null;
        if (u) fields[col] = u;
        else delete fields[col];
      }
      const companyId = d.rd_org_id ? orgToCompany.get(String(d.rd_org_id)) : undefined;
      if (companyId) fields.company_id = companyId;
      const contactIds = (
        ((raw.contacts as Array<{ _id?: string; id?: string }> | undefined) ?? [])
          .map((c) => rdId(c))
          .filter(Boolean) as string[]
      )
        .map((id) => contactByRd.get(id))
        .filter(Boolean) as string[];
      if (contactIds[0]) fields.contact_id = contactIds[0];
      if (contactIds.length) contactLinks.set(String(d.rd_id), contactIds);

      // fusões que vão para a empresa (CNPJ, porte, segmento, tipo) quando ela está vazia
      const compProj = proj.companies ?? {};
      if (companyId && Object.keys(compProj).length > 0) {
        const existing = existingCompanies.find((c) => c.id === companyId) ?? null;
        const patch = applyWithProvenance(
          existing,
          Object.fromEntries(
            Object.entries(compProj).filter(([k, v]) => v && (!existing || !existing[k])),
          ),
        );
        if (!dryRun && Object.keys(patch).length > 0) {
          const { error } = await supabaseAdmin
            .from("companies")
            .update(patch as never)
            .eq("id", companyId);
          if (error) errors.push(`companies (via deal) ${companyId}: ${error.message}`);
        }
      }

      const lines: Row[] = [];
      for (const p of (raw.deal_products as
        | Array<{
            name?: string;
            product?: { name?: string };
            amount?: number;
            price?: number;
            quantity?: number;
            total?: number;
          }>
        | undefined) ?? []) {
        const nome = clean(p.name ?? p.product?.name);
        if (!nome) continue;
        const qtd = Number(p.quantity ?? 1) || 1;
        const unit = Number(p.price ?? p.amount ?? 0) || 0;
        lines.push({
          nome,
          product_id: productByName.get(norm(nome)) ?? null,
          quantidade: qtd,
          valor_unitario: unit,
          total: Number(p.total ?? unit * qtd) || 0,
        });
      }
      if (lines.length) productLines.set(String(d.rd_id), lines);

      const existing = byRdD.get(String(d.rd_id)) ?? null;
      if (existing) {
        const patch = applyWithProvenance(existing, fields);
        if (Object.keys(patch).length > 0) updates.push({ id: String(existing.id), patch });
      } else {
        const prov: Record<string, string> = {};
        for (const k of Object.keys(fields)) prov[k] = "rd";
        inserts.push({ ...fields, provenance: prov });
      }
    }

    if (!dryRun) {
      const idByRd = new Map<string, string>(
        existingDeals.filter((d) => d.rd_deal_id).map((d) => [String(d.rd_deal_id), String(d.id)]),
      );
      for (const part of chunk(inserts, 300)) {
        const { data, error } = await supabaseAdmin
          .from("deals")
          .insert(part as never)
          .select("id, rd_deal_id");
        if (error) errors.push(`deals insert: ${error.message}`);
        else {
          result.deals.created += part.length;
          for (const r of (data ?? []) as Row[]) idByRd.set(String(r.rd_deal_id), String(r.id));
        }
      }
      for (const part of chunk(updates, 200)) {
        await Promise.all(
          part.map(async ({ id, patch }) => {
            const { error } = await supabaseAdmin
              .from("deals")
              .update(patch as never)
              .eq("id", id);
            if (error) errors.push(`deals update ${id}: ${error.message}`);
            else result.deals.updated++;
          }),
        );
      }
      // produtos por negócio (substitui as linhas do negócio)
      const prodRows: Row[] = [];
      for (const [rd, lines] of productLines) {
        const dealId = idByRd.get(rd);
        if (!dealId) continue;
        for (const l of lines) prodRows.push({ ...l, deal_id: dealId });
      }
      const dealIdsWithProducts = [...new Set(prodRows.map((r) => String(r.deal_id)))];
      for (const part of chunk(dealIdsWithProducts, 500)) {
        const { error } = await supabaseAdmin.from("deal_products").delete().in("deal_id", part);
        if (error) errors.push(`deal_products delete: ${error.message}`);
      }
      for (const part of chunk(prodRows, 500)) {
        const { error } = await supabaseAdmin.from("deal_products").insert(part as never);
        if (error) errors.push(`deal_products insert: ${error.message}`);
      }
      // contatos por negócio
      const linkRows: Row[] = [];
      for (const [rd, ids] of contactLinks) {
        const dealId = idByRd.get(rd);
        if (!dealId) continue;
        ids.forEach((cid, i) =>
          linkRows.push({ deal_id: dealId, contact_id: cid, principal: i === 0 }),
        );
      }
      for (const part of chunk(linkRows, 500)) {
        const { error } = await supabaseAdmin
          .from("deal_contacts")
          .upsert(part as never, { onConflict: "deal_id,contact_id", ignoreDuplicates: true });
        if (error) errors.push(`deal_contacts: ${error.message}`);
      }
    } else {
      result.deals.created = inserts.length;
      result.deals.updated = updates.length;
    }
  }

  if (!dryRun) {
    await supabaseAdmin.from("integration_logs").insert({
      provider: "rd_station",
      action: "transform_rd_objects",
      status: errors.length > 0 ? "partial" : "ok",
      detail: { ...result, errors: errors.slice(0, 20) } as never,
    });
  }
  result.errors = errors.slice(0, 50);
  return result;
}
