/*
 * Conta Azul → Compass, parte pura (sem rede nem banco).
 *
 * A Conta Azul não avisa nada (sem webhook): o Compass lê o que mudou e
 * traduz aqui. Os nomes dos campos seguem a API v2 (api-v2.contaazul.com):
 * vendas (/v1/venda/busca), notas de serviço (/v1/notas-fiscais-servico) e
 * contas a receber (/v1/financeiro/eventos-financeiros/contas-a-receber/buscar).
 * Tudo é lido de forma tolerante: campo que não vier fica null.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const txt = (v: unknown): string | null =>
  v == null || v === "" ? null : typeof v === "string" ? v : String(v);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const dia = (v: unknown): string | null => {
  const s = txt(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
export const soDigitos = (v: unknown) => (txt(v) ?? "").replace(/\D/g, "");

/** Lista de itens de qualquer resposta paginada da API. */
export function itensDaResposta(r: unknown): Obj[] {
  const o = obj(r);
  const lista = o.itens ?? o.items ?? o.data ?? o.content ?? (Array.isArray(r) ? r : []);
  return Array.isArray(lista) ? (lista as Obj[]) : [];
}

export type VendaCA = {
  id: string;
  numero: number | null;
  situacao: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  total: number | null;
  data: string | null;
  data_alteracao: string | null;
};

export function vendaDaApi(v: Obj): VendaCA | null {
  const id = txt(v.id);
  if (!id) return null;
  const sit = obj(v.situacao);
  const cliente = obj(v.cliente);
  return {
    id,
    numero: num(v.numero),
    situacao: (txt(sit.nome) ?? txt(v.situacao) ?? txt(v.status))?.toUpperCase() ?? null,
    cliente_id: txt(cliente.id),
    cliente_nome: txt(cliente.nome),
    total: num(v.total),
    data: dia(v.data),
    data_alteracao: txt(v.data_alteracao),
  };
}

export type NotaCA = {
  id: string;
  id_venda: string | null;
  numero_venda: string | null;
  numero_nfse: string | null;
  status: string | null;
  documento_cliente: string | null;
  nome_cliente: string | null;
  valor: number | null;
  data_competencia: string | null;
  motivo_cancelamento: string | null;
};

export function notaDaApi(n: Obj): NotaCA | null {
  const id = txt(n.id);
  if (!id) return null;
  const doc = soDigitos(n.documento_cliente);
  return {
    id,
    id_venda: txt(n.id_venda),
    numero_venda: txt(n.numero_venda),
    numero_nfse: txt(n.numero_nfse),
    status: txt(n.status)?.toUpperCase() ?? null,
    documento_cliente: doc || null,
    nome_cliente: txt(n.nome_cliente),
    valor: num(n.valor_total_nfse ?? n.valor),
    data_competencia: dia(n.data_competencia),
    motivo_cancelamento: txt(obj(n.informacoes_cancelamento).motivo),
  };
}

export type ReceberCA = {
  id: string;
  descricao: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  data_vencimento: string | null;
  status: string | null;
  total: number | null;
  pago: number | null;
  nao_pago: number | null;
  data_alteracao: string | null;
};

export function receberDaApi(r: Obj): ReceberCA | null {
  const id = txt(r.id);
  if (!id) return null;
  const cliente = obj(r.cliente);
  return {
    id,
    descricao: txt(r.descricao),
    cliente_id: txt(cliente.id),
    cliente_nome: txt(cliente.nome),
    data_vencimento: dia(r.data_vencimento),
    // status_traduzido é o legível (ATRASADO, RECEBIDO…); status pode vir em inglês.
    status: (txt(r.status_traduzido) ?? txt(r.status))?.toUpperCase() ?? null,
    total: num(r.total),
    pago: num(r.pago),
    nao_pago: num(r.nao_pago),
    data_alteracao: txt(r.data_alteracao),
  };
}

/** Nota que precisa de ação do comercial/ADM (não saiu ou foi barrada). */
export const NOTA_COM_PROBLEMA = new Set([
  "FALHA",
  "DENEGADA",
  "FALHA_CANCELAMENTO",
  "FALHA_CORRECAO",
  "AGUARDANDO_CORRECAO",
]);
export const NOTA_EM_ANDAMENTO = new Set([
  "PENDENTE",
  "PRONTA_ENVIO",
  "AGUARDANDO_RETORNO",
  "EM_ESPERA",
  "EMITINDO",
]);
const NOTA_VALIDA = new Set(["EMITIDA", "CORRIGIDA_SUCESSO"]);

export type ResumoFaturamento = {
  /** EMITIDA | PARCIAL | FALHA | CANCELADA | EM_EMISSAO | SEM_NOTA */
  status: string;
  numeros: string[];
  valorFaturado: number;
  primeiraEmissao: string | null;
  motivo: string | null;
};

/**
 * Resumo das notas de uma venda para o negócio. Uma venda pode ter várias
 * notas (faturamento parcelado): o vendido é o valor da venda, o faturado é
 * a soma das notas válidas.
 */
export function resumirNotas(notas: NotaCA[], totalVenda: number | null): ResumoFaturamento {
  const validas = notas.filter((n) => NOTA_VALIDA.has(n.status ?? ""));
  const valorFaturado = Math.round(validas.reduce((s, n) => s + (n.valor ?? 0), 0) * 100) / 100;
  const numeros = validas.map((n) => n.numero_nfse).filter((x): x is string => !!x);
  const primeiraEmissao =
    validas
      .map((n) => n.data_competencia)
      .filter((x): x is string => !!x)
      .sort()[0] ?? null;
  const problema = notas.find((n) => NOTA_COM_PROBLEMA.has(n.status ?? ""));
  let status = "SEM_NOTA";
  if (problema) status = "FALHA";
  else if (validas.length && totalVenda && valorFaturado + 0.01 < totalVenda) status = "PARCIAL";
  else if (validas.length) status = "EMITIDA";
  else if (notas.some((n) => NOTA_EM_ANDAMENTO.has(n.status ?? ""))) status = "EM_EMISSAO";
  else if (notas.some((n) => n.status === "CANCELADA" || n.status === "CANCELAMENTO_MANUAL"))
    status = "CANCELADA";
  return {
    status,
    numeros,
    valorFaturado,
    primeiraEmissao,
    motivo: problema?.motivo_cancelamento ?? null,
  };
}

/** Janelas de até N dias (a busca de notas exige período curto). */
export function janelas(de: string, ate: string, dias = 15): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let ini = new Date(`${de}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  while (ini <= fim) {
    const f = new Date(ini.getTime() + (dias - 1) * 864e5);
    const corte = f > fim ? fim : f;
    out.push([ini.toISOString().slice(0, 10), corte.toISOString().slice(0, 10)]);
    ini = new Date(corte.getTime() + 864e5);
  }
  return out;
}

/** Data e hora de Brasília sem fuso ("2026-11-23T10:15:00"), como a API pede. */
export function horaSP(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3600e3);
  return sp.toISOString().slice(0, 19);
}

/**
 * Venda da Conta Azul que corresponde a um negócio ganho: mesma empresa,
 * valor igual (2% de tolerância), não cancelada e livre. Só liga quando há
 * exatamente uma candidata — na dúvida, o ADM liga à mão.
 */
export function vendaDoNegocio(
  negocio: { company_id: string | null; amount: number | null },
  vendas: Array<VendaCA & { company_id: string | null }>,
  jaLigadas: Set<string>,
): string | null {
  if (!negocio.company_id || !negocio.amount) return null;
  const alvo = negocio.amount;
  const cands = vendas.filter(
    (v) =>
      v.company_id === negocio.company_id &&
      !jaLigadas.has(v.id) &&
      v.situacao !== "CANCELADO" &&
      v.total != null &&
      Math.abs(v.total - alvo) <= Math.max(1, alvo * 0.02),
  );
  return cands.length === 1 ? cands[0].id : null;
}
