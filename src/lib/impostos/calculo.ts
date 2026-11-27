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

/*
 * Regra de retenção (editável em Calculadora de impostos → Regras, como na
 * calculadora original). Escopo: um produto do catálogo, uma classificação
 * fiscal ou todas. Condições vazias valem para qualquer valor.
 */
export type RegraImposto = {
  id: string;
  nome: string;
  classificacao: Classificacao | null;
  produtoId: string | null;
  tipoPessoa: "CPF" | "CNPJ" | null;
  regime: Regime | null;
  /** Não vale para estes regimes (ex.: ISS não é retido de cliente Isento). */
  excetoRegimes: Regime[];
  municipio: string | null;
  categoriaEspecialIss: boolean;
  valorMin: number | null;
  valorMax: number | null;
  prioridade: number;
  itens: Array<{ imposto: string; aliquota: number }>;
  observacoes: string | null;
  ativo: boolean;
};

const regra = (
  r: Partial<RegraImposto> & Pick<RegraImposto, "id" | "nome" | "itens">,
): RegraImposto => ({
  classificacao: null,
  produtoId: null,
  tipoPessoa: null,
  regime: null,
  excetoRegimes: [],
  municipio: null,
  categoriaEspecialIss: false,
  valorMin: null,
  valorMax: null,
  prioridade: 10,
  observacoes: null,
  ativo: true,
  ...r,
});

const FEDERAIS_465 = [
  { imposto: "PIS", aliquota: 0.65 },
  { imposto: "COFINS", aliquota: 3 },
  { imposto: "CSLL", aliquota: 1 },
];
const IRRF = { imposto: "IRRF", aliquota: 1.5 };

/**
 * Regras da calculadora original (financeiro, 08/2026), por classificação.
 * São o ponto de partida do banco (impostos_regras) e a referência dos testes.
 */
export const REGRAS_PADRAO: RegraImposto[] = [
  regra({
    id: "trein-cpf",
    nome: "Treinamento — CPF (sem retenção)",
    classificacao: "treinamento",
    tipoPessoa: "CPF",
    itens: [],
    observacoes: "Pessoa física: nenhuma retenção.",
  }),
  regra({
    id: "trein-simples",
    nome: "Treinamento — CNPJ Simples Nacional",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    regime: "Simples Nacional",
    prioridade: 20,
    itens: [IRRF],
    observacoes:
      "Simples Nacional: dispensada retenção de PIS/COFINS/CSLL. Reter apenas IRRF 1,5%.",
  }),
  regra({
    id: "trein-mei",
    nome: "Treinamento — CNPJ MEI",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    regime: "MEI",
    prioridade: 20,
    itens: [IRRF],
    observacoes: "MEI dispensado de PIS, COFINS e CSLL. Retém apenas IRRF 1,5%.",
  }),
  regra({
    id: "trein-isento",
    nome: "Treinamento — CNPJ Isento",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    regime: "Isento",
    prioridade: 20,
    itens: [...FEDERAIS_465, IRRF],
    observacoes: "Cliente isento: deixa de reter ISS, mas federais (1,5% IRRF + 4,65%) continuam.",
  }),
  regra({
    id: "trein-ate-215",
    nome: "Treinamento — CNPJ até R$ 215,05",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    valorMax: 215.05,
    itens: [],
    observacoes: "Até R$ 215,05: sem retenção federal.",
  }),
  regra({
    id: "trein-215-666",
    nome: "Treinamento — CNPJ R$ 215,06 a R$ 666,66",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    valorMin: 215.06,
    valorMax: 666.66,
    itens: FEDERAIS_465,
    observacoes: "Reter PIS 0,65% + COFINS 3% + CSLL 1%. IRRF dispensado nesta faixa.",
  }),
  regra({
    id: "trein-acima-666",
    nome: "Treinamento — CNPJ acima de R$ 666,66",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    valorMin: 666.67,
    itens: [...FEDERAIS_465, IRRF],
    observacoes: "Reter PIS 0,65% + COFINS 3% + CSLL 1% + IRRF 1,5%.",
  }),
  regra({
    id: "trein-iss-poa",
    nome: "Treinamento — ISS Porto Alegre categoria especial",
    classificacao: "treinamento",
    tipoPessoa: "CNPJ",
    excetoRegimes: ["Isento"],
    municipio: "Porto Alegre",
    categoriaEspecialIss: true,
    prioridade: 5,
    itens: [{ imposto: "ISS", aliquota: 5 }],
    observacoes:
      "ISS retido na fonte (5%) quando o tomador é de Porto Alegre e de categoria especial (bancos, seguradoras, órgãos públicos, concessionárias, hospitais, condomínios, escolas privadas etc.).",
  }),
  ...(["licenciamento", "suporte"] as const).flatMap((cl) => [
    regra({
      id: `${cl}-sem-retencao`,
      nome: `${cl === "licenciamento" ? "Licenciamento" : "Suporte"} — sem retenção`,
      classificacao: cl,
      prioridade: 1,
      itens: [],
      observacoes: "Licenciamento/Suporte: nenhuma retenção federal nem ISS por padrão.",
    }),
    regra({
      id: `${cl}-iss-poa`,
      nome: `${cl === "licenciamento" ? "Licenciamento" : "Suporte"} — ISS Porto Alegre categoria especial`,
      classificacao: cl,
      tipoPessoa: "CNPJ",
      excetoRegimes: ["Isento"],
      municipio: "Porto Alegre",
      categoriaEspecialIss: true,
      prioridade: 5,
      itens: [{ imposto: "ISS", aliquota: 2 }],
      observacoes:
        "ISS retido na fonte (2%) quando o tomador é de Porto Alegre e de categoria especial.",
    }),
  ]),
];

/** "Porto Alegre", "PORTO ALEGRE", "porto alegre/RS" → true. */
export function ehPortoAlegre(municipio: string | null | undefined): boolean {
  return mesmoMunicipio(municipio, "Porto Alegre");
}

function semAcento(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[/-]\s*[a-z]{2}$/, "")
    .trim();
}

function mesmoMunicipio(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return semAcento(a) === semAcento(b);
}

export function tipoPessoaDoDocumento(doc: string | null | undefined): "CPF" | "CNPJ" | null {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return null;
}

type ItemCalculo = {
  nome: string;
  classificacao: Classificacao | null;
  bruto: number;
  produtoId?: string | null;
};

/** A regra vale para este item, cliente e valor? */
export function regraVale(r: RegraImposto, item: ItemCalculo, c: Cliente, bruto: number) {
  if (!r.ativo) return false;
  if (r.produtoId && r.produtoId !== (item.produtoId ?? null)) return false;
  if (r.classificacao && r.classificacao !== item.classificacao) return false;
  if (r.tipoPessoa && r.tipoPessoa !== c.tipoPessoa) return false;
  if (r.regime && (c.tipoPessoa !== "CNPJ" || r.regime !== c.regime)) return false;
  if (c.regime && c.tipoPessoa === "CNPJ" && r.excetoRegimes.includes(c.regime)) return false;
  if (r.municipio && !mesmoMunicipio(r.municipio, c.municipio)) return false;
  if (r.categoriaEspecialIss && !c.categoriaEspecialIss) return false;
  if (r.valorMin != null && bruto < r.valorMin) return false;
  if (r.valorMax != null && bruto > r.valorMax) return false;
  return true;
}

const ehMunicipal = (r: RegraImposto) =>
  r.itens.length > 0 && r.itens.every((i) => i.imposto.trim().toUpperCase().startsWith("ISS"));

/**
 * Como a calculadora original: regras de um produto específico substituem as
 * da classificação; as municipais (só ISS) sempre somam; entre as demais, vale
 * a de maior prioridade (regime específico vence a faixa de valor genérica).
 */
export function regrasAplicaveis(
  item: ItemCalculo,
  c: Cliente,
  bruto: number,
  regras: RegraImposto[] = REGRAS_PADRAO,
): RegraImposto[] {
  let lista = regras.filter((r) => regraVale(r, item, c, bruto));
  if (lista.some((r) => r.produtoId)) lista = lista.filter((r) => r.produtoId);
  const municipais = lista.filter(ehMunicipal);
  const federais = lista.filter((r) => !ehMunicipal(r));
  if (federais.length <= 1) return [...federais, ...municipais];
  const max = Math.max(...federais.map((r) => r.prioridade));
  return [...federais.filter((r) => r.prioridade === max), ...municipais];
}

/** Retenções de um item, sobre o valor bruto dele. */
export function calcularItem(
  item: ItemCalculo,
  c: Cliente,
  regras: RegraImposto[] = REGRAS_PADRAO,
): ResultadoItem {
  const bruto = r2(item.bruto);
  if (!item.classificacao && !regras.some((r) => r.produtoId && r.produtoId === item.produtoId))
    return {
      nome: item.nome,
      classificacao: null,
      bruto,
      impostos: [],
      total: 0,
      liquido: bruto,
      regra: "Item sem classificação fiscal: sem cálculo",
    };
  const aplic = regrasAplicaveis(item, c, bruto, regras);
  const impostos = aplic
    .flatMap((r) => r.itens)
    .map((a) => ({
      imposto: a.imposto,
      aliquota: a.aliquota,
      valor: r2((bruto * a.aliquota) / 100),
    }));
  const total = r2(impostos.reduce((s, x) => s + x.valor, 0));
  return {
    nome: item.nome,
    classificacao: item.classificacao,
    bruto,
    impostos,
    total,
    liquido: r2(bruto - total),
    regra: aplic.length ? aplic.map((r) => r.nome).join(" + ") : "Nenhuma regra: sem retenção",
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
  itens: ItemCalculo[],
  c: Cliente,
  regras: RegraImposto[] = REGRAS_PADRAO,
): Resultado {
  const res = itens.map((i) => calcularItem(i, c, regras));
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
  regras: RegraImposto[] = REGRAS_PADRAO,
): number {
  const fator = (b: number) =>
    calcularItem({ nome: "", classificacao, bruto: b }, c, regras).impostos.reduce(
      (s, l) => s + l.aliquota,
      0,
    ) / 100;
  const b0 = liquido / (1 - fator(liquido));
  return r2(liquido / (1 - fator(b0)));
}

/**
 * Fator para multiplicar todos os itens e chegar ao líquido pedido (o cliente
 * fixa quanto paga líquido; o bruto e os impostos saem daqui). Repete algumas
 * vezes porque a faixa de retenção muda com o valor de cada item.
 */
export function fatorParaLiquido(
  itens: ItemCalculo[],
  c: Cliente,
  liquido: number,
  regras: RegraImposto[] = REGRAS_PADRAO,
): { fator: number; resultado: Resultado } {
  const escala = (k: number) => itens.map((i) => ({ ...i, bruto: r2(i.bruto * k) }));
  let fator = 1;
  let resultado = calcular(itens, c, regras);
  if (resultado.liquido <= 0 || liquido <= 0) return { fator, resultado };
  for (let n = 0; n < 6; n++) {
    const prox = (fator * liquido) / resultado.liquido;
    if (Math.abs(prox - fator) < 1e-9) break;
    fator = prox;
    resultado = calcular(escala(fator), c, regras);
  }
  return { fator, resultado };
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

export type ResultadoSimulacao = Resultado & {
  desconto: number;
  comissaoPct: number;
  comissao: number;
  /** Líquido depois de impostos, desconto e comissão. */
  liquidoFinal: number;
  /** Fator aplicado aos valores dos itens (modo líquido). */
  fator: number;
};

/**
 * Simulação como na calculadora original: a partir dos valores brutos, ou de
 * quanto se quer receber líquido (os itens sobem na mesma proporção). Desconto
 * (R$) e comissão (% do bruto) saem do líquido.
 */
export function simular(
  itens: ItemCalculo[],
  c: Cliente,
  o: { modo: "bruto" | "liquido"; liquidoAlvo?: number; desconto?: number; comissaoPct?: number },
  regras: RegraImposto[] = REGRAS_PADRAO,
): ResultadoSimulacao {
  const desconto = Math.max(0, o.desconto ?? 0);
  const comissaoPct = Math.min(100, Math.max(0, o.comissaoPct ?? 0));
  const fechar = (res: Resultado, fator: number): ResultadoSimulacao => {
    const comissao = r2((res.bruto * comissaoPct) / 100);
    return {
      ...res,
      desconto,
      comissaoPct,
      comissao,
      liquidoFinal: r2(res.liquido - desconto - comissao),
      fator,
    };
  };
  const escala = (k: number) => itens.map((i) => ({ ...i, bruto: r2(i.bruto * k) }));
  let fator = 1;
  let atual = fechar(calcular(itens, c, regras), 1);
  const alvo = o.liquidoAlvo ?? 0;
  if (o.modo !== "liquido" || alvo <= 0 || atual.bruto <= 0) return atual;
  for (let n = 0; n < 12; n++) {
    if (atual.liquidoFinal <= 0) {
      fator *= 2;
    } else {
      const prox = (fator * alvo) / atual.liquidoFinal;
      if (Math.abs(prox - fator) < 1e-9) break;
      fator = prox;
    }
    atual = fechar(calcular(escala(fator), c, regras), fator);
  }
  return atual;
}
