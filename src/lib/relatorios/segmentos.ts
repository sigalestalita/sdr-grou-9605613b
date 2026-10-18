/*
 * Relatórios segmentados — parte pura. É o formato dos relatórios que a
 * Fabiana já apresenta: por porte, tipo, status, produto PDA × serviço,
 * cidade, estado e região.
 *
 * O estado vem do RD em texto livre (203 variantes: "SP", "São Paulo",
 * "sao paulo - SP", "Rio Grande do Sul"…); aqui vira UF e região.
 */

const UFS: Record<string, string> = {
  AC: "acre",
  AL: "alagoas",
  AP: "amapa",
  AM: "amazonas",
  BA: "bahia",
  CE: "ceara",
  DF: "distrito federal",
  ES: "espirito santo",
  GO: "goias",
  MA: "maranhao",
  MT: "mato grosso",
  MS: "mato grosso do sul",
  MG: "minas gerais",
  PA: "para",
  PB: "paraiba",
  PR: "parana",
  PE: "pernambuco",
  PI: "piaui",
  RJ: "rio de janeiro",
  RN: "rio grande do norte",
  RS: "rio grande do sul",
  RO: "rondonia",
  RR: "roraima",
  SC: "santa catarina",
  SP: "sao paulo",
  SE: "sergipe",
  TO: "tocantins",
};

const REGIAO: Record<string, string> = {
  AC: "Norte",
  AP: "Norte",
  AM: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul",
};

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// nomes mais longos primeiro: "mato grosso do sul" antes de "mato grosso"
const POR_NOME = Object.entries(UFS).sort((a, b) => b[1].length - a[1].length);

/** Texto livre de estado → UF (ou null se não der para saber). */
export function normalizarUF(estado: string | null | undefined): string | null {
  if (!estado) return null;
  const bruto = estado.trim();
  const sigla = bruto.toUpperCase().match(/(?:^|[^A-Z])([A-Z]{2})(?:$|[^A-Z])/);
  if (/^[A-Za-z]{2}$/.test(bruto) && UFS[bruto.toUpperCase()]) return bruto.toUpperCase();
  const t = semAcento(bruto);
  for (const [uf, nome] of POR_NOME) if (t === nome || t.includes(nome)) return uf;
  // "Campinas - SP", "Curitiba/PR"
  if (sigla && UFS[sigla[1]]) return sigla[1];
  return null;
}

export function regiaoDaUF(uf: string | null): string | null {
  return uf ? (REGIAO[uf] ?? null) : null;
}

export const DIMENSOES = [
  { v: "porte", l: "Porte" },
  { v: "tipo_venda", l: "Tipo (novo × recompra)" },
  { v: "status_cliente", l: "Status do cliente" },
  { v: "produto_servico", l: "Produto PDA × serviço" },
  { v: "marca", l: "Marca" },
  { v: "cidade", l: "Cidade" },
  { v: "estado", l: "Estado" },
  { v: "regiao", l: "Região" },
  { v: "executivo", l: "Executivo" },
] as const;
export type Dimensao = (typeof DIMENSOES)[number]["v"];

export type LinhaBase = {
  porte: string | null;
  tipoVenda: string | null;
  statusCliente: string | null;
  cidade: string | null;
  estado: string | null;
  executivo: string | null;
  /** Valor por (marca, tipo) do negócio. */
  partes: Array<{ marca: string | null; tipo: "produto" | "servico" | null; valor: number }>;
};

export type Grupo = {
  chave: string;
  negocios: number;
  valor: number;
  produto: number;
  servico: number;
};

const titulo = (s: string | null | undefined) => {
  const v = (s ?? "").trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "Não informado";
};

function tipoVendaRotulo(t: string | null): string {
  const v = semAcento(t ?? "");
  if (!v) return "Não informado";
  if (v.includes("novo")) return "Cliente novo";
  if (
    v.includes("recompra") ||
    v.includes("renov") ||
    v.includes("upsell") ||
    v.includes("up sell") ||
    v.includes("cross")
  )
    return "Recompra / carteira";
  return titulo(t);
}

/**
 * Agrupa as linhas pela dimensão. Em "produto × serviço" e "marca" um mesmo
 * negócio entra em mais de um grupo (pelo valor de cada parte); nas demais,
 * o negócio inteiro vai para um grupo.
 */
export function agrupar(linhas: LinhaBase[], dim: Dimensao): Grupo[] {
  const m = new Map<string, Grupo>();
  const soma = (chave: string, valor: number, produto: number, servico: number, conta: boolean) => {
    const g = m.get(chave) ?? { chave, negocios: 0, valor: 0, produto: 0, servico: 0 };
    g.valor += valor;
    g.produto += produto;
    g.servico += servico;
    if (conta) g.negocios += 1;
    m.set(chave, g);
  };
  for (const l of linhas) {
    const produto = l.partes.filter((p) => p.tipo === "produto").reduce((s, p) => s + p.valor, 0);
    const servico = l.partes.filter((p) => p.tipo === "servico").reduce((s, p) => s + p.valor, 0);
    const total = l.partes.reduce((s, p) => s + p.valor, 0);
    if (dim === "produto_servico" || dim === "marca") {
      const porChave = new Map<string, number>();
      for (const p of l.partes) {
        const k =
          dim === "marca"
            ? titulo(p.marca)
            : p.tipo === "produto"
              ? `Produto ${p.marca ?? ""}`.trim()
              : p.tipo === "servico"
                ? "Serviço"
                : "Sem tipo";
        porChave.set(k, (porChave.get(k) ?? 0) + p.valor);
      }
      for (const [k, v] of porChave)
        soma(k, v, k.startsWith("Produto") ? v : 0, k === "Serviço" ? v : 0, true);
      continue;
    }
    const uf = normalizarUF(l.estado);
    const chave =
      dim === "porte"
        ? titulo(l.porte)
        : dim === "tipo_venda"
          ? tipoVendaRotulo(l.tipoVenda)
          : dim === "status_cliente"
            ? titulo(l.statusCliente)
            : dim === "cidade"
              ? titulo(l.cidade) + (uf ? `/${uf}` : "")
              : dim === "estado"
                ? (uf ?? "Não informado")
                : dim === "regiao"
                  ? (regiaoDaUF(uf) ?? "Não informado")
                  : titulo(l.executivo);
    soma(chave, total, produto, servico, true);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return [...m.values()]
    .map((g) => ({ ...g, valor: r2(g.valor), produto: r2(g.produto), servico: r2(g.servico) }))
    .sort((a, b) => b.valor - a.valor);
}
