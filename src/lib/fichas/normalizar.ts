/*
 * Ficha cadastral vinda do app "cadastro-grou" — parte pura, sem banco.
 *
 * O app grava uma linha de client_registrations (PJ e PF na mesma tabela,
 * com valores de rádio inconsistentes: "boleto" × "Boleto", "sim" × "Não").
 * Aqui vira um formato só, com rótulos legíveis, para guardar e mostrar.
 */

export type FichaEntrada = Record<string, unknown>;

export type FichaNormalizada = {
  externoId: string | null;
  tipo: "CNPJ" | "CPF";
  documento: string | null;
  nome: string;
  nomeFantasia: string | null;
  email: string | null;
  vendedorNome: string | null;
  cidade: string | null;
  estado: string | null;
  enviadaEm: string;
  dados: Record<string, string>;
};

const txt = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
export const soDigitos = (v: unknown) => (txt(v) ?? "").replace(/\D/g, "") || null;

const REGIME: Record<string, string> = {
  simples: "Simples Nacional",
  simples_hibrido: "Simples Híbrido",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};
const ICMS: Record<string, string> = {
  contribuinte: "Contribuinte",
  "nao-contribuinte": "Não contribuinte",
  isento: "Contribuinte isento",
};
const PAGAMENTO: Record<string, string> = { boleto: "Boleto", deposito: "Depósito" };
const SIM_NAO: Record<string, string> = { sim: "Sim", nao: "Não", não: "Não" };

const mapa = (m: Record<string, string>, v: unknown) => {
  const s = txt(v);
  if (!s) return null;
  return m[s.toLowerCase()] ?? s;
};

/** Os campos da ficha, na ordem em que aparecem para quem lê, com rótulo. */
export const CAMPOS_FICHA: Array<{ chave: string; rotulo: string; grupo: string }> = [
  { chave: "razao_social", rotulo: "Razão social", grupo: "Empresa" },
  { chave: "nome_fantasia", rotulo: "Nome fantasia", grupo: "Empresa" },
  { chave: "cnpj", rotulo: "CNPJ", grupo: "Empresa" },
  { chave: "nome_completo", rotulo: "Nome completo", grupo: "Pessoa" },
  { chave: "cpf", rotulo: "CPF", grupo: "Pessoa" },
  { chave: "segmento", rotulo: "Segmento", grupo: "Empresa" },
  { chave: "numero_funcionarios", rotulo: "Nº de funcionários", grupo: "Empresa" },
  { chave: "site", rotulo: "Site", grupo: "Empresa" },
  { chave: "inscricao_estadual", rotulo: "Inscrição estadual", grupo: "Fiscal" },
  { chave: "inscricao_municipal", rotulo: "Inscrição municipal", grupo: "Fiscal" },
  { chave: "regime_tributario", rotulo: "Regime tributário", grupo: "Fiscal" },
  { chave: "contribuinte_icms", rotulo: "Contribuinte do ICMS", grupo: "Fiscal" },
  { chave: "endereco", rotulo: "Endereço", grupo: "Endereço" },
  { chave: "complemento", rotulo: "Complemento", grupo: "Endereço" },
  { chave: "bairro", rotulo: "Bairro", grupo: "Endereço" },
  { chave: "cidade", rotulo: "Cidade", grupo: "Endereço" },
  { chave: "estado", rotulo: "UF", grupo: "Endereço" },
  { chave: "cep", rotulo: "CEP", grupo: "Endereço" },
  { chave: "telefone", rotulo: "Telefone", grupo: "Contatos" },
  { chave: "whatsapp", rotulo: "WhatsApp", grupo: "Contatos" },
  { chave: "contato_pessoa", rotulo: "Contato principal", grupo: "Contatos" },
  { chave: "contato_cargo", rotulo: "Cargo", grupo: "Contatos" },
  { chave: "contato_email", rotulo: "E-mail", grupo: "Contatos" },
  { chave: "contato_telefone", rotulo: "Telefone do contato", grupo: "Contatos" },
  { chave: "nfe_pessoa", rotulo: "Contato da NF-e", grupo: "Faturamento" },
  { chave: "nfe_telefone", rotulo: "Telefone NF-e", grupo: "Faturamento" },
  { chave: "nfe_emails", rotulo: "E-mails para NF/boleto", grupo: "Faturamento" },
  {
    chave: "ordem_compra_obrigatoria",
    rotulo: "Ordem de compra obrigatória na NF",
    grupo: "Faturamento",
  },
  { chave: "forma_pagamento", rotulo: "Forma de pagamento", grupo: "Faturamento" },
  { chave: "politica_pagamento", rotulo: "Política de pagamento", grupo: "Faturamento" },
  { chave: "observacoes", rotulo: "Observações", grupo: "Faturamento" },
  { chave: "vendedor_responsavel", rotulo: "Vendedor responsável", grupo: "Grou" },
  { chave: "cnpj_situacao_cadastral", rotulo: "Situação na Receita", grupo: "Grou" },
];

/** Linha de client_registrations (como o app manda no webhook) → ficha. */
export function normalizarFicha(r: FichaEntrada): FichaNormalizada {
  const tipo = String(r.client_type ?? "").toUpperCase() === "CPF" ? "CPF" : "CNPJ";
  const dados: Record<string, string> = {};
  for (const { chave } of CAMPOS_FICHA) {
    const v = txt(r[chave]);
    if (v) dados[chave] = v;
  }
  const regime = mapa(REGIME, r.regime_tributario);
  if (regime) dados.regime_tributario = regime;
  const icms = mapa(ICMS, r.contribuinte_icms);
  if (icms) dados.contribuinte_icms = icms;
  const pag = mapa(PAGAMENTO, r.forma_pagamento);
  if (pag) dados.forma_pagamento = pag;
  const oc = mapa(SIM_NAO, r.ordem_compra_obrigatoria);
  if (oc) dados.ordem_compra_obrigatoria = oc;
  if (tipo === "CPF") delete dados.contato_cargo; // o app grava "Cliente" fixo

  const nome =
    tipo === "CPF"
      ? (txt(r.nome_completo) ?? txt(r.contato_pessoa) ?? "Sem nome")
      : (txt(r.razao_social) ?? txt(r.nome_fantasia) ?? "Sem nome");
  return {
    externoId: txt(r.id),
    tipo,
    documento: soDigitos(tipo === "CPF" ? r.cpf : r.cnpj),
    nome,
    nomeFantasia: tipo === "CNPJ" ? txt(r.nome_fantasia) : null,
    email: txt(r.contato_email)?.toLowerCase() ?? null,
    vendedorNome: txt(r.vendedor_responsavel),
    cidade: txt(r.cidade),
    estado: txt(r.estado)?.toUpperCase() ?? null,
    enviadaEm: txt(r.created_at) ?? new Date().toISOString(),
    dados,
  };
}

/** "06934208000164" → "06.934.208/0001-64"; CPF → "000.000.000-00". */
export function formatarDocumento(d: string | null): string {
  if (!d) return "";
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

/** Nome do vendedor na ficha × nome no Compass (sem acento, caixa, espaços). */
export function mesmoNome(a: string | null, b: string | null): boolean {
  const n = (s: string | null) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return !!a && !!b && n(a) === n(b);
}

/** CSV simples (vírgula, aspas duplas, BOM) → linhas com cabeçalho. */
export function lerCsv(texto: string): Array<Record<string, string>> {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const t = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ",") {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      if (linha.some((c) => c.trim())) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  linha.push(campo);
  if (linha.some((c) => c.trim())) linhas.push(linha);
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  return resto.map((l) => Object.fromEntries(cab.map((h, i) => [h.trim(), (l[i] ?? "").trim()])));
}

/**
 * Linha do CSV "Todos" exportado do painel da ficha (Tipo, Razão Social /
 * Nome, Nome Completo, CNPJ, CPF, Vendedor Responsável, Email, Telefone,
 * WhatsApp, Cidade, Estado, Status, Data de Cadastro dd/mm/aaaa).
 */
export function fichaDoCsv(r: Record<string, string>): FichaNormalizada | null {
  const tipo = (r["Tipo"] ?? "").toUpperCase() === "CPF" ? "CPF" : "CNPJ";
  const documento = soDigitos(tipo === "CPF" ? r["CPF"] : r["CNPJ"]);
  const nome =
    (tipo === "CPF" ? txt(r["Nome Completo"]) : txt(r["Razão Social / Nome"])) ??
    txt(r["Razão Social / Nome"]) ??
    txt(r["Nome Completo"]);
  const data = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r["Data de Cadastro"] ?? "");
  if (!nome || !data) return null;
  const dados: Record<string, string> = {};
  const tel = txt(r["Telefone"]);
  const wpp = txt(r["WhatsApp"]);
  if (tel) dados.telefone = tel;
  if (wpp) dados.whatsapp = wpp;
  if (txt(r["Cidade"])) dados.cidade = txt(r["Cidade"])!;
  if (txt(r["Estado"])) dados.estado = txt(r["Estado"])!.toUpperCase();
  if (txt(r["Email"])) dados.contato_email = txt(r["Email"])!.toLowerCase();
  if (txt(r["Vendedor Responsável"])) dados.vendedor_responsavel = txt(r["Vendedor Responsável"])!;
  if (tipo === "CPF") dados.nome_completo = nome;
  else dados.razao_social = nome;
  return {
    externoId: null,
    tipo,
    documento,
    nome,
    nomeFantasia: null,
    email: txt(r["Email"])?.toLowerCase() ?? null,
    vendedorNome: txt(r["Vendedor Responsável"]),
    cidade: txt(r["Cidade"]),
    estado: txt(r["Estado"])?.toUpperCase() ?? null,
    enviadaEm: `${data[3]}-${data[2]}-${data[1]}T12:00:00-03:00`,
    dados,
  };
}
