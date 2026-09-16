/*
 * Leitura do export da base de marketing do RD.
 *
 * A API de marketing do RD é feita para consultar um lead por vez, não para
 * listar a base inteira. O caminho que funciona para 70 mil é o próprio export
 * do RD (Base de Leads → Exportações), que devolve CSV. Este módulo entende
 * esse CSV.
 *
 * Fica separado do servidor de propósito: mapear coluna de planilha é onde o
 * erro acontece, e aqui dá para testar sem banco nenhum.
 */

export type LinhaDoExport = Record<string, string>;

export type LeadDeMarketing = {
  rdMarketingId: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  empresa: string | null;
  cargo: string | null;
  website: string | null;
  criadoEm: string | null;
  conversoes: number | null;
  ultimaConversao: string | null;
  nomeUltimaConversao: string | null;
};

/** O RD muda o rótulo da coluna conforme o idioma e a versão do export. */
const COLUNAS: Record<keyof LeadDeMarketing, string[]> = {
  rdMarketingId: ["id", "lead id", "uuid", "identificador"],
  nome: ["nome", "name", "lead"],
  email: ["email", "e-mail"],
  telefone: ["telefone", "phone", "celular", "mobile phone", "personal phone"],
  empresa: ["empresa", "company", "organização", "organizacao"],
  cargo: ["cargo", "job title", "função", "funcao"],
  website: ["website", "site", "url da empresa"],
  criadoEm: ["data de criação", "data de criacao", "created at", "criado em"],
  conversoes: ["conversões", "conversoes", "conversions", "número de conversões"],
  ultimaConversao: ["última conversão", "ultima conversao", "last conversion"],
  nomeUltimaConversao: [
    "nome da última conversão",
    "nome da ultima conversao",
    "last conversion name",
    "identificador da última conversão",
  ],
};

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Acha a coluna pelo rótulo, tolerando acento, caixa e variação de nome. */
export function acharColuna(cabecalhos: string[], candidatos: string[]): string | null {
  const mapa = new Map(cabecalhos.map((c) => [normalizar(c), c]));
  for (const cand of candidatos) {
    const achado = mapa.get(normalizar(cand));
    if (achado) return achado;
  }
  // Fallback: começa com o candidato ("telefone celular" para "telefone").
  for (const [norm, original] of mapa) {
    if (candidatos.some((c) => norm.startsWith(normalizar(c)))) return original;
  }
  return null;
}

function numero(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/\D+/g, ""));
  return Number.isFinite(n) && (v ?? "").trim() !== "" ? n : null;
}

function texto(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" || t === "-" ? null : t;
}

/**
 * Converte as linhas do export em leads.
 *
 * Linha sem e-mail e sem telefone é descartada: não dá para casar com nada nem
 * para falar com ninguém, e entraria só para pesar a base.
 */
export function lerExportDeMarketing(linhas: LinhaDoExport[]): {
  leads: LeadDeMarketing[];
  ignoradas: number;
} {
  if (linhas.length === 0) return { leads: [], ignoradas: 0 };
  const cabecalhos = Object.keys(linhas[0]);
  const col = Object.fromEntries(
    Object.entries(COLUNAS).map(([chave, cands]) => [chave, acharColuna(cabecalhos, cands)]),
  ) as Record<keyof LeadDeMarketing, string | null>;

  const leads: LeadDeMarketing[] = [];
  let ignoradas = 0;

  for (const linha of linhas) {
    const pegar = (k: keyof LeadDeMarketing) => (col[k] ? texto(linha[col[k]!]) : null);
    const email = pegar("email");
    const telefone = pegar("telefone");
    if (!email && !telefone) {
      ignoradas += 1;
      continue;
    }
    leads.push({
      rdMarketingId: pegar("rdMarketingId"),
      nome: pegar("nome"),
      email: email?.toLowerCase() ?? null,
      telefone,
      empresa: pegar("empresa"),
      cargo: pegar("cargo"),
      website: pegar("website"),
      criadoEm: pegar("criadoEm"),
      conversoes: col.conversoes ? numero(linha[col.conversoes]) : null,
      ultimaConversao: pegar("ultimaConversao"),
      nomeUltimaConversao: pegar("nomeUltimaConversao"),
    });
  }

  return { leads, ignoradas };
}
