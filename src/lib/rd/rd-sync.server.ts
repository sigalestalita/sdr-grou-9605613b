import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRdTokenInfo } from "@/lib/rd-token.server";
import {
  contactEmail,
  contactPhone,
  dealAmount,
  dealStatus,
  fetchRdContacts,
  fetchMapaDeFunis,
  fetchRdDeals,
  fetchRdOrganizations,
  findField,
  funilDoNegocio,
  rdId,
  type MapaDeFunis,
  type RdContactRaw,
  type RdCustomField,
  type RdDealRaw,
  type RdOrganizationRaw,
} from "./rd-api.server";

export interface RdFullSyncResult {
  organizations: { fetched: number; saved: number };
  contacts: { fetched: number; saved: number; csContacts: number };
  deals: { fetched: number; saved: number; leadsCreated: number; leadsUpdated: number };
  csClients: { matched: number; created: number; updated: number };
  pipelines: Record<string, number>;
  errors: string[];
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function orgFields(o: RdOrganizationRaw): RdCustomField[] {
  return [...(o.organization_custom_fields ?? []), ...(o.custom_fields ?? [])];
}

function orgSite(o: RdOrganizationRaw): string | null {
  return (o.url ?? o.website ?? o.site ?? "").toString().trim() || null;
}

function orgSegment(o: RdOrganizationRaw): string | null {
  const s = typeof o.segment === "string" ? o.segment : o.segment?.name;
  return s?.trim() || null;
}

function orgLifecycle(o: RdOrganizationRaw): string | null {
  const raw = findField(orgFields(o), "[grou] ciclo de vida", "ciclo de vida");
  return raw ? raw.replace(/[\u200b-\u200f\ufeff]/g, "").trim() || null : null;
}

function orgCnpj(o: RdOrganizationRaw): string | null {
  const raw = (findField(orgFields(o), "cnpj") ?? "").replace(/\D/g, "");
  return raw.length >= 11 ? raw : null;
}

// A listagem de negócios não traz o nome do funil: vem pelo id da etapa.
let mapaDeFunis: MapaDeFunis | null = null;
function dealPipeline(d: RdDealRaw): string | null {
  return funilDoNegocio(d, mapaDeFunis);
}

/** Traduz a etapa do funil do RD para o slug do nosso Kanban. */
function mapStageSlug(stageName: string | null, status: "won" | "lost" | "open"): string {
  if (status === "won") return "comercial";
  const s = (stageName ?? "").toLowerCase();
  if (!s) return status === "lost" ? "perdido" : "novo";
  if (/desqualific|sem fit|fora de perfil/.test(s)) return "desqualificado";
  if (/perdid|n[aã]o avan|declin/.test(s)) return "perdido";
  if (/proposta|contrato|fechamento|negocia|comercial|closer/.test(s)) return "comercial";
  if (/agend|reuni[aã]o|meeting|demo/.test(s)) return "agendado";
  if (/no[- ]?show|n[aã]o compareceu|faltou/.test(s)) return "no_show";
  if (/aguard|retorno|follow/.test(s)) return "aguardando";
  if (/qualific|diagn[oó]stic|descoberta/.test(s)) return "qualificacao";
  if (/abord|contato|cad[eê]ncia|prospec/.test(s)) return "abordado";
  if (/pronto|enriquec/.test(s)) return "pronto";
  if (status === "lost") return "perdido";
  return "novo";
}

function guessLeadType(orgName: string | null, lifecycle: string | null): string {
  if (!orgName) return "pessoa_fisica";
  if ((lifecycle ?? "").toLowerCase().includes("partner")) return "consultoria";
  return /consultoria|assessoria|contabil|contábil|partner/i.test(orgName) ? "consultoria" : "empresa";
}

/**
 * Espelha EMPRESAS, CONTATOS e NEGÓCIOS do RD CRM no banco e projeta esses dados
 * nos módulos: clientes/contatos de CS e leads do Kanban. O RD é a fonte da verdade
 * para dados cadastrais; sinaleira, health score, touchpoints e notas nunca são apagados.
 */
export async function syncRdEverything(opts?: { dryRun?: boolean }): Promise<RdFullSyncResult> {
  const { token } = await getRdTokenInfo();
  if (!token) throw new Error("RD Station não conectado. Conecte em Configurações.");

  const now = new Date().toISOString();
  const errors: string[] = [];

  const orgs = await fetchRdOrganizations(token);
  const contacts = await fetchRdContacts(token);
  const deals = await fetchRdDeals(token);
  mapaDeFunis = await fetchMapaDeFunis(token);

  const pipelines: Record<string, number> = {};
  for (const d of deals) {
    const p = dealPipeline(d) ?? "(sem funil)";
    pipelines[p] = (pipelines[p] ?? 0) + 1;
  }

  const result: RdFullSyncResult = {
    organizations: { fetched: orgs.length, saved: 0 },
    contacts: { fetched: contacts.length, saved: 0, csContacts: 0 },
    deals: { fetched: deals.length, saved: 0, leadsCreated: 0, leadsUpdated: 0 },
    csClients: { matched: 0, created: 0, updated: 0 },
    pipelines,
    errors,
  };

  if (opts?.dryRun) return result;

  // ---------- 1. Espelho de empresas ----------
  const orgRows = orgs
    .filter((o) => rdId(o) && (o.name ?? "").trim())
    .map((o) => ({
      rd_id: rdId(o) as string,
      name: (o.name as string).trim(),
      lifecycle: orgLifecycle(o),
      cnpj: orgCnpj(o),
      site_url: orgSite(o),
      segment: orgSegment(o),
      owner_name: o.user?.name ?? o.user?.email ?? null,
      raw: o as never,
      synced_at: now,
    }));
  for (const part of chunk(orgRows, 400)) {
    const { error } = await supabaseAdmin.from("rd_organizations").upsert(part as never, { onConflict: "rd_id" });
    if (error) errors.push(`empresas: ${error.message}`);
    else result.organizations.saved += part.length;
  }
  const orgNameById = new Map(orgRows.map((o) => [o.rd_id, o.name]));
  const orgLifecycleById = new Map(orgRows.map((o) => [o.rd_id, o.lifecycle]));

  // ---------- 2. Espelho de contatos (inclui os embutidos nas empresas/negócios) ----------
  const allContacts = new Map<string, { c: RdContactRaw; orgId: string | null }>();
  const pushContact = (c: RdContactRaw, orgId: string | null) => {
    const id = rdId(c);
    if (!id || !(c.name ?? "").trim()) return;
    const prev = allContacts.get(id);
    allContacts.set(id, { c: { ...(prev?.c ?? {}), ...c }, orgId: orgId ?? prev?.orgId ?? null });
  };
  for (const c of contacts) pushContact(c, rdId(c.organization ?? undefined) ?? c.organization_id ?? null);
  for (const o of orgs) for (const c of o.contacts ?? []) pushContact(c, rdId(o));
  for (const d of deals) for (const c of d.contacts ?? []) pushContact(c, rdId(d.organization ?? undefined));

  const contactRows = [...allContacts.entries()].map(([id, { c, orgId }]) => ({
    rd_id: id,
    name: (c.name as string).trim(),
    email: contactEmail(c),
    phone: contactPhone(c),
    position: c.title ?? c.job_title ?? null,
    linkedin_url: c.linkedin ?? null,
    rd_org_id: orgId,
    rd_org_name: (orgId ? orgNameById.get(orgId) : null) ?? c.organization?.name ?? null,
    owner_name: c.user?.name ?? c.user?.email ?? null,
    raw: c as never,
    synced_at: now,
  }));
  result.contacts.fetched = contactRows.length;
  for (const part of chunk(contactRows, 400)) {
    const { error } = await supabaseAdmin.from("rd_contacts").upsert(part as never, { onConflict: "rd_id" });
    if (error) errors.push(`contatos: ${error.message}`);
    else result.contacts.saved += part.length;
  }

  // ---------- 3. Espelho de negócios ----------
  const dealRows = deals
    .filter((d) => rdId(d))
    .map((d) => ({
      rd_id: rdId(d) as string,
      name: (d.name ?? "Sem nome").trim(),
      pipeline: dealPipeline(d),
      stage: d.deal_stage?.name?.trim() ?? null,
      amount: dealAmount(d),
      status: dealStatus(d),
      rd_org_id: rdId(d.organization ?? undefined),
      rd_org_name: d.organization?.name ?? null,
      rd_contact_id: rdId(d.contacts?.[0] ?? undefined),
      owner_name: d.user?.name ?? d.user?.email ?? null,
      source_name:
        d.deal_source?.name ?? (typeof d.source === "string" ? d.source : d.source?.name) ?? null,
      campaign_name: d.campaign?.name ?? null,
      rd_created_at: d.created_at ?? null,
      raw: d as never,
      synced_at: now,
    }));
  for (const part of chunk(dealRows, 300)) {
    const { error } = await supabaseAdmin.from("rd_deals").upsert(part as never, { onConflict: "rd_id" });
    if (error) errors.push(`negócios: ${error.message}`);
    else result.deals.saved += part.length;
  }

  // ---------- 4. Clientes de CS a partir das empresas ----------
  try {
    const cs = await (await import("@/lib/cs/rd-clients.server")).syncRdClientsToCs({ orgs: orgs as never });
    result.csClients = { matched: cs.matched, created: cs.created, updated: cs.updated };
    errors.push(...cs.errors.slice(0, 10));

    // ---------- 5. Contatos de CS a partir dos contatos do RD ----------
    const orgToClient = cs.orgToClient ?? new Map<string, string>();
    const csContactRows = contactRows
      .filter((c) => c.rd_org_id && orgToClient.has(c.rd_org_id))
      .map((c) => ({
        client_uid: orgToClient.get(c.rd_org_id as string) as string,
        nome: c.name,
        email: c.email,
        whatsapp: c.phone,
        cargo: c.position,
        rd_contact_id: c.rd_id,
        origem_detecao: "manual" as const,
        ativo_no_cliente: true,
      }));
    for (const part of chunk(csContactRows, 300)) {
      const { error } = await supabaseAdmin
        .from("cs_contacts")
        .upsert(part as never, { onConflict: "rd_contact_id" });
      if (error) errors.push(`contatos CS: ${error.message}`);
      else result.contacts.csContacts += part.length;
    }
  } catch (e) {
    errors.push(`clientes CS: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ---------- 6. Leads do Kanban a partir dos negócios ----------
  const { data: stages } = await supabaseAdmin.from("stages").select("id, slug");
  const stageBySlug = new Map(
    ((stages ?? []) as Array<{ id: string; slug: string }>).map((s) => [s.slug, s.id]),
  );
  const contactById = new Map(contactRows.map((c) => [c.rd_id, c]));

  const { fetchAllRows } = await import("@/lib/cs/cs-core.server");
  const existingLeads = await fetchAllRows<{ id: string; rd_deal_id: string | null }>((from, to) =>
    supabaseAdmin.from("leads").select("id, rd_deal_id").not("rd_deal_id", "is", null).range(from, to),
  );
  const leadByDeal = new Map<string, string>();
  for (const l of existingLeads ?? []) if (l.rd_deal_id) leadByDeal.set(l.rd_deal_id, l.id);

  // Só os funis do SDR viram lead. Vendas, carteira e CS são negócio, conta e
  // jornada — a transformação (rd-transform) cuida deles.
  const { destinoDoFunilRd } = await import("./funis");
  for (const d of dealRows) {
    const destino = destinoDoFunilRd(d.pipeline);
    if (destino.tipo !== "lead") continue;
    const contact = d.rd_contact_id ? contactById.get(d.rd_contact_id) : undefined;
    const companyName = d.rd_org_name ?? (d.rd_org_id ? orgNameById.get(d.rd_org_id) ?? null : null);
    const lifecycle = d.rd_org_id ? orgLifecycleById.get(d.rd_org_id) ?? null : null;
    const slug = mapStageSlug(d.stage, (d.status ?? "open") as "won" | "lost" | "open");
    const patch = {
      rd_deal_id: d.rd_id,
      rd_org_id: d.rd_org_id,
      rd_contact_id: d.rd_contact_id,
      rd_pipeline: d.pipeline,
      rd_status: d.stage,
      rd_owner: d.owner_name,
      name: contact?.name ?? companyName ?? d.name,
      email: contact?.email ?? null,
      phone: contact?.phone ?? null,
      position: contact?.position ?? null,
      linkedin_url: contact?.linkedin_url ?? null,
      company_name: companyName,
      // O funil manda: Alianças Estratégicas é consultoria.
      lead_type:
        destino.leadType === "consultoria" ? "consultoria" : guessLeadType(companyName, lifecycle),
      source: d.source_name,
      campaign: d.campaign_name,
      converted_at: d.rd_created_at,
      stage_id: stageBySlug.get(slug) ?? stageBySlug.get("novo") ?? null,
    };

    const existingId = leadByDeal.get(d.rd_id);
    if (existingId) {
      const { error } = await supabaseAdmin.from("leads").update(patch as never).eq("id", existingId);
      if (error) errors.push(`lead ${d.name}: ${error.message}`);
      else result.deals.leadsUpdated++;
    } else {
      const { error } = await supabaseAdmin
        .from("leads")
        .insert({ ...patch, last_action_at: now } as never);
      if (error) errors.push(`lead ${d.name}: ${error.message}`);
      else result.deals.leadsCreated++;
    }
  }

  await supabaseAdmin.from("integration_logs").insert({
    provider: "rd_station",
    action: "sync_rd_all",
    status: errors.length > 0 ? "partial" : "ok",
    detail: {
      organizations: result.organizations,
      contacts: result.contacts,
      deals: result.deals,
      csClients: result.csClients,
      pipelines,
      errors: errors.slice(0, 20),
    } as never,
  });

  result.errors = errors.slice(0, 50);
  return result;
}
