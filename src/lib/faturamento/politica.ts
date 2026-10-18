/*
 * Faturamento — parte pura, sem banco.
 *
 * O que a Fabiana pediu primeiro foi ver a regra do cliente ANTES: exige
 * ordem de compra, só aceita nota de tal a tal dia, só paga à vista porque
 * fica devendo, retém imposto. Hoje isso vive em comentário no WebMais e só
 * aparece na hora de faturar — a nota sai errada, refaz, e se perdem 60 dias.
 *
 * Aqui ficam: a política com herança matriz → filial, as contas de data
 * (janela de emissão, vencimento, parcelas), as retenções e a conferência do
 * ganho, que devolve o que falta para o ADM conseguir faturar.
 */

// ---------------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------------
export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Dígitos verificadores do CNPJ (rejeita os repetidos, como 000…0). */
export function cnpjValido(v: string | null | undefined): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const d1 = calc(d.slice(0, 12), p1);
  const d2 = calc(d.slice(0, 12) + d1, p2);
  return d.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Os 8 primeiros dígitos: o que liga as filiais (Gerdau tem 50 CNPJs). */
export function cnpjRaiz(v: string | null | undefined): string | null {
  const d = soDigitos(v);
  return d.length === 14 ? d.slice(0, 8) : null;
}

// ---------------------------------------------------------------------------
// Política do cliente
// ---------------------------------------------------------------------------
export type PrazoTipo = "dias_apos_emissao" | "dia_fixo" | "a_vista";

/** Espelha public.company_faturamento. NULL = não definido nesta empresa. */
export type Politica = {
  codigo_webmais: string | null;
  exige_oc: boolean | null;
  janela_emissao_inicio: number | null;
  janela_emissao_fim: number | null;
  prazo_tipo: PrazoTipo | null;
  prazo_valor: number | null;
  aceita_parcelamento: boolean | null;
  forma_pagamento: string | null;
  retencao_iss: number | null;
  retencao_irrf: number | null;
  retencao_pis: number | null;
  retencao_cofins: number | null;
  retencao_csll: number | null;
  retencao_inss: number | null;
  regime_tributario: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  emails_nf: string[];
  ficha_url: string | null;
  ficha_recebida_em: string | null;
  observacoes: string | null;
};

export const POLITICA_VAZIA: Politica = {
  codigo_webmais: null,
  exige_oc: null,
  janela_emissao_inicio: null,
  janela_emissao_fim: null,
  prazo_tipo: null,
  prazo_valor: null,
  aceita_parcelamento: null,
  forma_pagamento: null,
  retencao_iss: null,
  retencao_irrf: null,
  retencao_pis: null,
  retencao_cofins: null,
  retencao_csll: null,
  retencao_inss: null,
  regime_tributario: null,
  inscricao_estadual: null,
  inscricao_municipal: null,
  emails_nf: [],
  ficha_url: null,
  ficha_recebida_em: null,
  observacoes: null,
};

export const RETENCOES = [
  { campo: "retencao_iss", rotulo: "ISS" },
  { campo: "retencao_irrf", rotulo: "IRRF" },
  { campo: "retencao_pis", rotulo: "PIS" },
  { campo: "retencao_cofins", rotulo: "COFINS" },
  { campo: "retencao_csll", rotulo: "CSLL" },
  { campo: "retencao_inss", rotulo: "INSS" },
] as const satisfies ReadonlyArray<{ campo: keyof Politica; rotulo: string }>;

/**
 * Campos que a filial herda da matriz quando não tem o seu. O código WebMais,
 * a ficha e os dados fiscais são do CNPJ — não se herdam.
 */
const HERDAVEIS = [
  "exige_oc",
  "janela_emissao_inicio",
  "janela_emissao_fim",
  "prazo_tipo",
  "prazo_valor",
  "aceita_parcelamento",
  "forma_pagamento",
  "retencao_iss",
  "retencao_irrf",
  "retencao_pis",
  "retencao_cofins",
  "retencao_csll",
  "retencao_inss",
  "observacoes",
] as const satisfies ReadonlyArray<keyof Politica>;

export type PoliticaEfetiva = Politica & {
  /** Campos que vieram da matriz, para a tela dizer "herdado". */
  herdados: Array<keyof Politica>;
  /** Alguma regra foi definida (própria ou herdada)? */
  definida: boolean;
};

export function normalizarPolitica(row: Partial<Politica> | null | undefined): Politica {
  if (!row) return { ...POLITICA_VAZIA };
  const out = { ...POLITICA_VAZIA } as Record<string, unknown>;
  for (const k of Object.keys(POLITICA_VAZIA)) {
    const v = (row as Record<string, unknown>)[k];
    if (v === undefined) continue;
    // numeric do Postgres chega como string
    out[k] = k.startsWith("retencao_") && v !== null ? Number(v) : v;
  }
  out.emails_nf = Array.isArray(row.emails_nf) ? row.emails_nf : [];
  return out as Politica;
}

export function resolverPolitica(
  propria: Partial<Politica> | null | undefined,
  matriz?: Partial<Politica> | null,
): PoliticaEfetiva {
  const p = normalizarPolitica(propria);
  const m = matriz ? normalizarPolitica(matriz) : null;
  const herdados: Array<keyof Politica> = [];
  const out = { ...p } as Record<string, unknown>;
  if (m) {
    for (const k of HERDAVEIS) {
      if (p[k] === null && m[k] !== null) {
        out[k] = m[k];
        herdados.push(k);
      }
    }
  }
  const efetiva = out as Politica;
  const definida =
    HERDAVEIS.some((k) => efetiva[k] !== null) || !!efetiva.codigo_webmais || !!efetiva.ficha_url;
  return { ...efetiva, herdados, definida };
}

export function totalRetencaoPct(p: Pick<Politica, (typeof RETENCOES)[number]["campo"]>): number {
  return RETENCOES.reduce((s, r) => s + (Number(p[r.campo]) || 0), 0);
}

/** Frases curtas para o card: "Exige OC", "Nota só de 1 a 20", "D+15"… */
export function resumoPolitica(p: PoliticaEfetiva): string[] {
  const out: string[] = [];
  if (p.exige_oc === true) out.push("Exige ordem de compra");
  if (p.exige_oc === false) out.push("Não exige OC");
  if (p.janela_emissao_inicio && p.janela_emissao_fim)
    out.push(`Nota só do dia ${p.janela_emissao_inicio} ao ${p.janela_emissao_fim}`);
  const prazo = descreverPrazo(p);
  if (prazo) out.push(prazo);
  if (p.aceita_parcelamento === false) out.push("Não parcela");
  if (p.forma_pagamento) out.push(p.forma_pagamento);
  const ret = totalRetencaoPct(p);
  if (ret > 0) {
    const quais = RETENCOES.filter((r) => Number(p[r.campo]) > 0).map(
      (r) => `${r.rotulo} ${Number(p[r.campo]).toLocaleString("pt-BR")}%`,
    );
    out.push(`Retém ${quais.join(" + ")}`);
  }
  return out;
}

export function descreverPrazo(p: Pick<Politica, "prazo_tipo" | "prazo_valor">): string | null {
  if (p.prazo_tipo === "a_vista") return "À vista";
  if (p.prazo_tipo === "dias_apos_emissao" && p.prazo_valor != null)
    return `Paga ${p.prazo_valor} dias após a emissão`;
  if (p.prazo_tipo === "dia_fixo" && p.prazo_valor != null) return `Paga todo dia ${p.prazo_valor}`;
  return null;
}

// ---------------------------------------------------------------------------
// Datas (sempre dia de calendário, sem hora: "YYYY-MM-DD")
// ---------------------------------------------------------------------------
function parse(d: string): Date {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ultimoDia(ano: number, mes0: number): number {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}
/** Dia N do mês; se o mês não tem o dia (31 em fevereiro), cai no último. */
function diaDoMes(ano: number, mes0: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes0, Math.min(dia, ultimoDia(ano, mes0))));
}
export function somarDias(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}
export function somarMeses(d: string, n: number): string {
  const x = parse(d);
  return iso(diaDoMes(x.getUTCFullYear(), x.getUTCMonth() + n, x.getUTCDate()));
}

/** A data cai dentro da janela de emissão? Janela pode virar o mês (25 a 5). */
export function dentroDaJanela(data: string, inicio: number | null, fim: number | null): boolean {
  if (!inicio || !fim) return true;
  const dia = parse(data).getUTCDate();
  return inicio <= fim ? dia >= inicio && dia <= fim : dia >= inicio || dia <= fim;
}

/** Primeira data a partir de `desde` em que a nota pode ser emitida. */
export function proximaEmissao(desde: string, inicio: number | null, fim: number | null): string {
  if (dentroDaJanela(desde, inicio, fim) || !inicio) return desde.slice(0, 10);
  const d = parse(desde);
  const noMes = diaDoMes(d.getUTCFullYear(), d.getUTCMonth(), inicio);
  return iso(noMes > d ? noMes : diaDoMes(d.getUTCFullYear(), d.getUTCMonth() + 1, inicio));
}

/** Vencimento da primeira parcela, pela regra do cliente. */
export function primeiroVencimento(
  emissao: string,
  p: Pick<Politica, "prazo_tipo" | "prazo_valor">,
): string {
  if (p.prazo_tipo === "dias_apos_emissao" && p.prazo_valor != null)
    return somarDias(emissao, p.prazo_valor);
  if (p.prazo_tipo === "dia_fixo" && p.prazo_valor) {
    const d = parse(emissao);
    const noMes = diaDoMes(d.getUTCFullYear(), d.getUTCMonth(), p.prazo_valor);
    return iso(
      noMes > d ? noMes : diaDoMes(d.getUTCFullYear(), d.getUTCMonth() + 1, p.prazo_valor),
    );
  }
  return emissao.slice(0, 10);
}

export type Parcela = { numero: number; vencimento: string; valor: number };

/**
 * Divide o valor em N parcelas mensais. Os centavos que sobram da divisão vão
 * para a última, para a soma bater com a nota.
 */
export function gerarParcelas(valor: number, n: number, vencimento1: string): Parcela[] {
  const qtd = Math.max(1, Math.floor(n));
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / qtd);
  return Array.from({ length: qtd }, (_, i) => ({
    numero: i + 1,
    vencimento: somarMeses(vencimento1, i),
    valor: (i === qtd - 1 ? centavos - base * (qtd - 1) : base) / 100,
  }));
}

export function calcularRetencoes(
  valorBruto: number,
  p: Pick<Politica, (typeof RETENCOES)[number]["campo"]>,
): {
  total: number;
  liquido: number;
  itens: Array<{ rotulo: string; pct: number; valor: number }>;
} {
  const itens = RETENCOES.filter((r) => Number(p[r.campo]) > 0).map((r) => {
    const pct = Number(p[r.campo]);
    return { rotulo: r.rotulo, pct, valor: Math.round(valorBruto * pct) / 100 };
  });
  const total = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  return { total, liquido: Math.round((valorBruto - total) * 100) / 100, itens };
}

// ---------------------------------------------------------------------------
// Conferência do ganho
// ---------------------------------------------------------------------------
export type DadosGanho = {
  ocSituacao: "numero" | "nao_tem" | "anexo" | null;
  ocNumero: string | null;
  ocAnexoUrl: string | null;
  cnpjFaturamento: string | null;
  emissaoPrevistaEm: string | null;
  parcelas: number | null;
  valor: number | null;
  contatoFaturamento: boolean;
  /** Primeira compra pede a ficha cadastral; recompra basta o CNPJ. */
  clienteNovo: boolean;
};

export type Pendencia = {
  campo: string;
  mensagem: string;
  /** bloqueia = o ganho não pode ser registrado assim. */
  bloqueia: boolean;
};

/**
 * O que impede ou atrapalha o faturamento. Usada no diálogo de ganho (o
 * comercial vê antes de salvar) e na fila do ADM (o que conferir).
 */
export function conferirGanho(g: DadosGanho, p: PoliticaEfetiva): Pendencia[] {
  const out: Pendencia[] = [];
  const temOc =
    (g.ocSituacao === "numero" && !!g.ocNumero?.trim()) ||
    (g.ocSituacao === "anexo" && !!g.ocAnexoUrl?.trim());

  if (g.ocSituacao === "numero" && !g.ocNumero?.trim())
    out.push({ campo: "oc", mensagem: "Informe o número da ordem de compra", bloqueia: true });
  if (g.ocSituacao === "anexo" && !g.ocAnexoUrl?.trim())
    out.push({ campo: "oc", mensagem: "Anexe o link da ordem de compra", bloqueia: true });
  if (p.exige_oc === true && !temOc)
    out.push({
      campo: "oc",
      mensagem: "Este cliente exige ordem de compra: sem ela a nota volta",
      bloqueia: true,
    });

  if (!g.cnpjFaturamento)
    out.push({ campo: "cnpj", mensagem: "Falta o CNPJ de faturamento", bloqueia: false });
  else if (!cnpjValido(g.cnpjFaturamento))
    out.push({ campo: "cnpj", mensagem: "CNPJ de faturamento inválido", bloqueia: true });

  if ((g.parcelas ?? 1) > 1 && p.aceita_parcelamento === false)
    out.push({
      campo: "parcelas",
      mensagem: "Cliente sem parcelamento liberado (só à vista)",
      bloqueia: true,
    });

  if (
    g.emissaoPrevistaEm &&
    !dentroDaJanela(g.emissaoPrevistaEm, p.janela_emissao_inicio, p.janela_emissao_fim)
  )
    out.push({
      campo: "emissao",
      mensagem: `Fora da janela do cliente (dia ${p.janela_emissao_inicio} ao ${p.janela_emissao_fim}): a próxima data possível é ${proximaEmissao(g.emissaoPrevistaEm, p.janela_emissao_inicio, p.janela_emissao_fim)}`,
      bloqueia: false,
    });

  if (!g.contatoFaturamento)
    out.push({
      campo: "contato",
      mensagem: "Falta quem recebe a nota e o boleto",
      bloqueia: false,
    });

  if (g.clienteNovo && !p.ficha_url && !p.ficha_recebida_em)
    out.push({
      campo: "ficha",
      mensagem: "Cliente novo sem ficha cadastral",
      bloqueia: false,
    });

  if (!g.valor || g.valor <= 0)
    out.push({ campo: "valor", mensagem: "Falta o valor fechado", bloqueia: true });

  return out;
}
