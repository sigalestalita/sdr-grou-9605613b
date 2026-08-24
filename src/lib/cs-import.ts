export type CsImportRow = {
  nome_empresa: string;
  cnpj?: string | null;
  parent_nome?: string | null;
  tipo_lead: "empresa" | "consultoria";
  origem: "marketing" | "indicacao" | "outbound" | "renovacao";
  aporte_valor: number;
  login_pda?: string | null;
  linkedin_url?: string | null;
  site_url?: string | null;
  data_inicio_contrato?: string | null;
  data_renovacao?: string | null;
  cs_responsavel_email?: string | null;
  comercial_responsavel_email?: string | null;
};

export function normCsDate(v: string): string | null {
  if (!v) return null;
  const br = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Converte o CSV da carteira (separador ; ou ,) em linhas de importação de clientes. */
export function parseCsvClients(text: string): CsImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: CsImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep).map((c) => c.trim());
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? cells[i] || "" : "";
    };
    const nome = get("nome_empresa");
    if (!nome) continue;
    const tipo = get("tipo_lead").toLowerCase() === "consultoria" ? "consultoria" : "empresa";
    const origemRaw = get("origem").toLowerCase();
    const origem = (["marketing", "indicacao", "outbound", "renovacao"] as const).includes(origemRaw as never)
      ? (origemRaw as CsImportRow["origem"])
      : "marketing";
    out.push({
      nome_empresa: nome,
      cnpj: get("cnpj") || null,
      parent_nome: get("parent_nome") || null,
      tipo_lead: tipo,
      origem,
      aporte_valor: Number(get("aporte_valor").replace(/\./g, "").replace(",", ".")) || 0,
      login_pda: get("login_pda") || null,
      linkedin_url: get("linkedin_url") || null,
      site_url: get("site_url") || null,
      data_inicio_contrato: normCsDate(get("data_inicio_contrato")),
      data_renovacao: normCsDate(get("data_renovacao")),
      cs_responsavel_email: get("cs_responsavel_email") || null,
      comercial_responsavel_email: get("comercial_responsavel_email") || null,
    });
  }
  return out;
}
