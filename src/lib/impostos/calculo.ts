/*
 * Impostos retidos na fonte pelo cliente — parte pura, sem banco.
 *
 * Mesmas regras da "Calculadora de Impostos" que o comercial usava à parte
 * (regras escritas pelo financeiro em 08/2026), com dois ajustes conscientes
 * para seguir o texto delas:
 *   - CPF não retém nada, nem ISS ("CPF: não reter nenhum imposto");
 *   - CNPJ Isento não retém ISS ("deixa de reter o ISS"), só os federais.
 * E a faixa de valor é contínua: até R$ 666,66 é a faixa do meio, acima disso
 * entra o IRRF (a calculadora deixava um buraco entre 666,66 e 666,67).
 *
 * Regras por classificação do serviço (CNAE da nota):
 *   Licenciamento (62.03-1-00) e Suporte (62.09-1-00): nenhuma retenção, salvo
 *     ISS 2% de tomador de Porto Alegre em categoria especial.
 *   Treinamento (85.99-6-04):
 *     CPF ................................ nada
 *     CNPJ Simples Nacional ou MEI ....... IRRF 1,5%
 *     CNPJ Isento ........................ PIS 0,65% + COFINS 3% + CSLL 1% + IRRF 1,5%
 *     outros CNPJ, até R$ 215,05 ......... nada
 *     outros CNPJ, R$ 215,06 a 666,66 .... PIS + COFINS + CSLL (4,65%)
 *     outros CNPJ, acima de R$ 666,66 .... PIS + COFINS + CSLL + IRRF (6,15%)
 *     + ISS 5% se tomador de Porto Alegre em categoria especial
 * Base: o valor bruto de cada item; cada imposto arredondado em centavos.
 */

export type Classificacao = "licenciamento" | "suporte" | "treinamento";
export type Regime = "Simples Nacional" | "MEI" | "Lucro Presumido" | "Lucro Real" | "Isento";

export const CLASSIFICACOES: Array<{ v: Classificacao; rotulo: string; cnae: string }> = [
  {
    v: "licenciamento",
    rotulo: "Licenciamento",
    cnae: "62.03-1-00 – Desenvolvimento e licenciamento de programas de computador não customizáveis",
  },
  {
    v: "suporte",
    rotulo: "Suporte",
    cnae: "62.09-1-00 – Suporte técnico em informática",
  },
  {
    v: "treinamento",
    rotulo: "Treinamento",
    cnae: "85.99-6-04 – Treinamento em desenvolvimento profissional e gerencial",
  },
];

export const REGIMES: Regime[] = [
  "Simples Nacional",
  "MEI",
  "Lucro Presumido",
  "Lucro Real",
  "Isento",
];

export const CATEGORIAS_ESPECIAIS_ISS = [
  "Bancos e demais instituições financeiras",
  "Empresas seguradoras",
  "Administração pública direta/indireta/fundacional (Município)",
  "Administração pública direta/indireta/fundacional (Estado)",
  "Concessionárias de energia, telefonia, distribuição de água",
  "Administração pública direta/indireta/fundacional (União)",
  "Tomador/intermediário de serviço do exterior",
  "Administradoras de imóveis (sobre serviços a ela prestados)",
  "Condomínios (sobre serviços a eles prestados)",
  "Hospitais, manicômios e prontos-socorros",
  "Entidades educacionais privadas (fundamental, médio ou superior)",
];

export type Cliente = {
  tipoPessoa: "CPF" | "CNPJ";
  regime: Regime | null;
  municipio: string | null;
  categoriaEspecialIss: boolean;
};

export type LinhaImposto = { imposto: string; aliquota: number; valor: number };

export type ResultadoItem = {
  nome: string;
  classificacao: Classificacao | null;
  bruto: number;
  impostos: LinhaImposto[];
  total: number;
  liquido: number;
  regra: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

const FEDERAIS_465 = [
  { imposto: "PIS", aliquota: 0.65 },
  { imposto: "COFINS", aliquota: 3 },
  { imposto: "CSLL", aliquota: 1 },
];
const IRRF = { imposto: "IRRF", aliquota: 1.5 };

/** "Porto Alegre", "PORTO ALEGRE", "porto alegre/RS" → true. */
export function ehPortoAlegre(municipio: string | null | undefined): boolean {
  if (!municipio) return false;
  const s = municipio
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[/-]\s*rs$/, "")
    .trim();
  return s === "porto alegre";
}

export function tipoPessoaDoDocumento(doc: string | null | undefined): "CPF" | "CNPJ" | null {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return null;
}

function federais(classificacao: Classificacao | null, c: Cliente, bruto: number) {
  if (classificacao !== "treinamento" || c.tipoPessoa === "CPF") {
    return {
      itens: [],
      regra:
        classificacao === "treinamento"
          ? "Pessoa física: sem retenção"
          : "Licenciamento/suporte: sem retenção federal",
    };
  }
  if (c.regime === "Simples Nacional" || c.regime === "MEI") {
    return { itens: [IRRF], regra: `${c.regime}: só IRRF 1,5%` };
  }
  if (c.regime === "Isento") {
    return { itens: [...FEDERAIS_465, IRRF], regra: "Isento: PIS, COFINS, CSLL e IRRF (6,15%)" };
  }
  if (bruto <= 215.05) return { itens: [], regra: "Até R$ 215,05: sem retenção" };
  if (bruto <= 666.66)
    return { itens: FEDERAIS_465, regra: "R$ 215,06 a R$ 666,66: PIS, COFINS e CSLL (4,65%)" };
  return {
    itens: [...FEDERAIS_465, IRRF],
    regra: "Acima de R$ 666,66: PIS, COFINS, CSLL e IRRF (6,15%)",
  };
}

function iss(classificacao: Classificacao | null, c: Cliente) {
  if (!classificacao || c.tipoPessoa === "CPF" || c.regime === "Isento") return null;
  if (!c.categoriaEspecialIss || !ehPortoAlegre(c.municipio)) return null;
  return { imposto: "ISS", aliquota: classificacao === "treinamento" ? 5 : 2 };
}

/** Retenções de um item, sobre o valor bruto dele. */
export function calcularItem(
  item: { nome: string; classificacao: Classificacao | null; bruto: number },
  c: Cliente,
): ResultadoItem {
  const bruto = r2(item.bruto);
  const f = federais(item.classificacao, c, bruto);
  const i = iss(item.classificacao, c);
  const aliquotas = [...f.itens, ...(i ? [i] : [])];
  const impostos = aliquotas.map((a) => ({ ...a, valor: r2((bruto * a.aliquota) / 100) }));
  const total = r2(impostos.reduce((s, x) => s + x.valor, 0));
  return {
    nome: item.nome,
    classificacao: item.classificacao,
    bruto,
    impostos,
    total,
    liquido: r2(bruto - total),
    regra: item.classificacao
      ? [f.regra, i ? `ISS ${i.aliquota}% (Porto Alegre, categoria especial)` : null]
          .filter(Boolean)
          .join(" + ")
      : "Item sem classificação fiscal: sem cálculo",
  };
}

export type Resultado = {
  itens: ResultadoItem[];
  porImposto: LinhaImposto[];
  bruto: number;
  impostos: number;
  liquido: number;
  aliquotaEfetiva: number;
  semClassificacao: number;
};

export function calcular(
  itens: Array<{ nome: string; classificacao: Classificacao | null; bruto: number }>,
  c: Cliente,
): Resultado {
  const res = itens.map((i) => calcularItem(i, c));
  const soma = new Map<string, LinhaImposto>();
  for (const r of res) {
    for (const l of r.impostos) {
      const a = soma.get(l.imposto);
      soma.set(l.imposto, {
        imposto: l.imposto,
        aliquota: l.aliquota,
        valor: r2((a?.valor ?? 0) + l.valor),
      });
    }
  }
  const bruto = r2(res.reduce((s, r) => s + r.bruto, 0));
  const impostos = r2(res.reduce((s, r) => s + r.total, 0));
  return {
    itens: res,
    porImposto: [...soma.values()],
    bruto,
    impostos,
    liquido: r2(bruto - impostos),
    aliquotaEfetiva: bruto > 0 ? r2((impostos / bruto) * 100) : 0,
    semClassificacao: res.filter((r) => !r.classificacao).length,
  };
}

/**
 * Bruto que deixa o líquido pedido (quando o cliente fixa quanto quer pagar
 * líquido). Recalcula uma vez para a faixa de valor certa, como a calculadora.
 */
export function brutoParaLiquido(
  liquido: number,
  classificacao: Classificacao,
  c: Cliente,
): number {
  const fator = (b: number) =>
    calcularItem({ nome: "", classificacao, bruto: b }, c).impostos.reduce(
      (s, l) => s + l.aliquota,
      0,
    ) / 100;
  const b0 = liquido / (1 - fator(liquido));
  return r2(liquido / (1 - fator(b0)));
}

/** Regime a partir da consulta de CNPJ (BrasilAPI); Lucro Real e Isento só manual. */
export function regimeDaReceita(r: {
  opcao_pelo_mei?: boolean | null;
  opcao_pelo_simples?: boolean | null;
}): Regime {
  if (r.opcao_pelo_mei) return "MEI";
  if (r.opcao_pelo_simples) return "Simples Nacional";
  return "Lucro Presumido";
}
