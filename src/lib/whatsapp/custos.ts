/*
 * Quanto custa a mensageria do WhatsApp.
 *
 * A Meta muda a forma de cobrar de tempos em tempos, e os valores variam por
 * país, por categoria e por acordo comercial. Por isso nada de preço fixo no
 * código: a tabela fica em configuração, a pessoa copia do painel de cobrança
 * da Meta, e aqui só mora a conta.
 *
 * Assim o painel continua certo quando o preço mudar de novo, e um modelo
 * futuro é só mais uma tabela com data de início.
 */

/** As categorias que a Meta cobra separado. */
export const CATEGORIAS = ["marketing", "utility", "authentication", "service"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ROTULO_DA_CATEGORIA: Record<Categoria, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
  service: "Atendimento",
};

/**
 * "conversa" é o modelo antigo: cobra a janela de 24h aberta, não cada
 * mensagem. "mensagem" cobra por template entregue.
 */
export type UnidadeDeCobranca = "conversa" | "mensagem";

export type ModeloDeCobranca = {
  id: string;
  nome: string;
  unidade: UnidadeDeCobranca;
  /** Primeiro dia em que este modelo vale, "2026-10-01". */
  vigenteDe: string | null;
  /** Preço unitário em reais, por categoria. */
  precos: Record<Categoria, number>;
  /** Observação livre, para lembrar de onde veio o número. */
  nota?: string;
};

export type VolumeDoMes = {
  /** "2026-09" */
  mes: string;
  /** Templates cobráveis enviados no mês, por categoria. */
  enviadosPorCategoria: Record<Categoria, number>;
  /**
   * Templates que saíram de graça por estarem dentro da janela de 24h.
   *
   * A Meta não cobra utilidade enviada enquanto a janela aberta pelo cliente
   * está valendo. Contar esses junto inflaria a conta; contar em separado
   * mostra quanto a janela está economizando.
   */
  gratuitosNaJanela: Record<Categoria, number>;
  /** Conversas que tiveram ao menos um template daquela categoria no mês. */
  conversasPorCategoria: Record<Categoria, number>;
  /** Mensagens livres enviadas dentro da janela aberta (não são template). */
  respostasLivres: number;
  /** Mensagens recebidas do lead. Não são cobradas, mas explicam o volume. */
  recebidas: number;
};

export type CustoPorCategoria = {
  categoria: Categoria;
  unidades: number;
  precoUnitario: number;
  total: number;
};

export type CustoDoMes = {
  mes: string;
  linhas: CustoPorCategoria[];
  total: number;
};

export function zeradoPorCategoria(): Record<Categoria, number> {
  return { marketing: 0, utility: 0, authentication: 0, service: 0 };
}

/** Quantas unidades cobráveis o mês teve, segundo a unidade do modelo. */
export function unidadesCobradas(
  volume: VolumeDoMes,
  modelo: ModeloDeCobranca,
): Record<Categoria, number> {
  const base =
    modelo.unidade === "conversa" ? volume.conversasPorCategoria : volume.enviadosPorCategoria;
  return { ...zeradoPorCategoria(), ...base };
}

export function custoDoMes(volume: VolumeDoMes, modelo: ModeloDeCobranca): CustoDoMes {
  const unidades = unidadesCobradas(volume, modelo);
  const linhas = CATEGORIAS.map((categoria) => {
    const qtd = unidades[categoria] ?? 0;
    const preco = modelo.precos[categoria] ?? 0;
    return { categoria, unidades: qtd, precoUnitario: preco, total: qtd * preco };
  });
  return { mes: volume.mes, linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
}

export type Comparacao = {
  mes: string;
  atual: number;
  futuro: number;
  diferenca: number;
  /** Variação percentual; null quando o custo atual é zero e não dá para dividir. */
  variacao: number | null;
};

/** O mesmo volume, cobrado pelas duas tabelas, para enxergar o impacto. */
export function compararModelos(
  volumes: VolumeDoMes[],
  atual: ModeloDeCobranca,
  futuro: ModeloDeCobranca,
): Comparacao[] {
  return volumes.map((v) => {
    const a = custoDoMes(v, atual).total;
    const f = custoDoMes(v, futuro).total;
    return {
      mes: v.mes,
      atual: a,
      futuro: f,
      diferenca: f - a,
      variacao: a === 0 ? null : (f - a) / a,
    };
  });
}

/** Nenhum preço preenchido ainda: o painel avisa em vez de mostrar zero como verdade. */
export function semPrecoConfigurado(modelo: ModeloDeCobranca): boolean {
  return CATEGORIAS.every((c) => !modelo.precos[c]);
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarDolar(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}

/**
 * A Meta publica o preço em dólar e converte na cotação do dia. Guardar o
 * dólar e o câmbio separados mantém a tabela válida quando a moeda mexe — e
 * deixa claro que o valor em real é estimativa, não fatura.
 */
export function emReais(valorEmDolar: number, cambio: number): number {
  return valorEmDolar * (cambio > 0 ? cambio : 0);
}

/** Categorias que a janela de 24h isenta. Marketing paga sempre. */
export const ISENTAS_NA_JANELA: ReadonlySet<Categoria> = new Set<Categoria>(["utility", "service"]);
