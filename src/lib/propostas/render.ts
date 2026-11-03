/*
 * Proposta comercial — parte pura, sem banco.
 *
 * Um modelo é texto (introdução, condições, seções e rodapé) em markdown
 * simples com variáveis {{...}}. A proposta junta o modelo de cada item do
 * negócio (licença + capacitação = as seções dos dois, sem repetir cláusula),
 * troca as variáveis e congela tudo em `conteudo`: o que o cliente vê nunca
 * muda depois de enviado, mesmo que o modelo seja editado.
 */
import { brutoItem, descontoItem, totalItem, type ItemNegocio } from "@/lib/catalogo/itens";

export type Secao = { titulo: string; corpo: string };

export type ModeloTexto = {
  id: string;
  nome: string;
  versao: number;
  cor: string;
  titulo: string;
  introducao: string;
  condicoes: string;
  secoes: Secao[];
  rodape: string;
  codigo_nfse: string | null;
};

export type ItemProposta = {
  nome: string;
  quantidade: number;
  valor_unitario: number;
  desconto: number;
  desconto_rotulo: string;
  subtotal: number;
  recorrencia: string;
};

export type ConteudoProposta = {
  cor: string;
  titulo: string;
  emitidaEm: string;
  validadeAte: string | null;
  pagamento: string;
  cliente: { empresa: string; contato: string; cargo: string | null; cnpj: string | null };
  executivo: { nome: string; email: string | null };
  introducao: string;
  condicoes: string;
  itens: ItemProposta[];
  totais: { bruto: number; desconto: number; total: number; impostos: number; final: number };
  secoes: Secao[];
  rodape: string;
  observacoes: string;
  modelos: Array<{ id: string; nome: string; versao: number }>;
  codigosNfse: string[];
};

export const VARIAVEIS: Array<{ chave: string; descricao: string }> = [
  { chave: "contato.nome", descricao: "Nome do contato" },
  { chave: "contato.cargo", descricao: "Cargo do contato" },
  { chave: "empresa.nome", descricao: "Nome da empresa" },
  { chave: "empresa.cnpj", descricao: "CNPJ da empresa" },
  { chave: "negocio.nome", descricao: "Nome do negócio" },
  { chave: "executivo.nome", descricao: "Quem envia a proposta" },
  { chave: "executivo.email", descricao: "E-mail de quem envia" },
  { chave: "pagamento", descricao: "Forma de pagamento escolhida" },
  { chave: "validade", descricao: "Validade da proposta (data)" },
  { chave: "data", descricao: "Data de emissão" },
  { chave: "valor_total", descricao: "Valor total do pedido" },
  { chave: "valor_final", descricao: "Valor final (após impostos)" },
];

const centavos = (v: number) => Math.round(v * 100) / 100;

export function moedaBr(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBr(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Troca {{chave}} pelo valor; chave desconhecida fica como está, para aparecer na revisão. */
export function trocarVariaveis(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (inteiro, chave: string) =>
    chave in valores ? valores[chave] : inteiro,
  );
}

/** Variáveis usadas no texto que o sistema não conhece (erro de digitação no modelo). */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set(VARIAVEIS.map((v) => v.chave));
  const achadas = new Set<string>();
  for (const m of texto.matchAll(/\{\{\s*([a-z_.]+)\s*\}\}/gi)) {
    if (!conhecidas.has(m[1])) achadas.add(m[1]);
  }
  return [...achadas];
}

/** Junta textos linha a linha, sem repetir uma linha que já está lá. */
function juntarSemRepetir(base: string, extra: string): string {
  const ja = new Set(
    base
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const novas = extra.split("\n").filter((l) => !l.trim() || !ja.has(l.trim()));
  const resto = novas.join("\n").trim();
  return resto ? `${base.trimEnd()}\n\n${resto}` : base;
}

/**
 * Seções de vários modelos: mesma seção (mesmo título) vira uma só, com as
 * cláusulas que faltam; seções novas entram na ordem em que aparecem.
 */
export function juntarSecoes(listas: Secao[][]): Secao[] {
  const out: Secao[] = [];
  for (const lista of listas) {
    for (const s of lista) {
      const igual = out.find(
        (o) => o.titulo.trim().toLowerCase() === s.titulo.trim().toLowerCase(),
      );
      if (igual) igual.corpo = juntarSemRepetir(igual.corpo, s.corpo);
      else out.push({ titulo: s.titulo, corpo: s.corpo });
    }
  }
  return out;
}

export function addDias(isoData: string, dias: number): string {
  const d = new Date(`${isoData.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type DadosProposta = {
  hoje: string; // yyyy-mm-dd
  validadeDias: number;
  pagamento: string;
  observacoes: string;
  impostos: number;
  negocio: string;
  cliente: ConteudoProposta["cliente"];
  executivo: ConteudoProposta["executivo"];
  itens: Array<
    Pick<
      ItemNegocio,
      "nome" | "quantidade" | "valor_unitario" | "desconto_tipo" | "desconto" | "recorrencia"
    >
  >;
};

const REC: Record<string, string> = { unico: "Único", mensal: "Mensal", anual: "Anual" };

/**
 * Monta o conteúdo congelado. `modelos[0]` é o principal (cabeçalho,
 * introdução, condições, cor); os outros só acrescentam seções e rodapé.
 */
export function montarConteudo(modelos: ModeloTexto[], d: DadosProposta): ConteudoProposta {
  if (modelos.length === 0) throw new Error("Escolha um modelo de proposta");
  const [principal] = modelos;

  const itens: ItemProposta[] = d.itens.map((i) => {
    const desc = descontoItem(i);
    const rotulo =
      desc === 0
        ? "0%"
        : i.desconto_tipo === "valor"
          ? moedaBr(desc)
          : `${(Number(i.desconto) || 0).toLocaleString("pt-BR")}%`;
    return {
      nome: i.nome,
      quantidade: Number(i.quantidade) || 0,
      valor_unitario: Number(i.valor_unitario) || 0,
      desconto: desc,
      desconto_rotulo: rotulo,
      subtotal: totalItem(i),
      recorrencia: REC[i.recorrencia ?? "unico"] ?? "Único",
    };
  });
  const bruto = centavos(d.itens.reduce((s, i) => s + brutoItem(i), 0));
  const total = centavos(itens.reduce((s, i) => s + i.subtotal, 0));
  const impostos = centavos(Math.min(Math.max(d.impostos || 0, 0), total));
  const validadeAte = addDias(d.hoje, d.validadeDias);

  const valores: Record<string, string> = {
    "contato.nome": d.cliente.contato || "",
    "contato.cargo": d.cliente.cargo ?? "",
    "empresa.nome": d.cliente.empresa || "",
    "empresa.cnpj": d.cliente.cnpj ?? "",
    "negocio.nome": d.negocio,
    "executivo.nome": d.executivo.nome,
    "executivo.email": d.executivo.email ?? "",
    pagamento: d.pagamento || "a combinar",
    validade: `${dataBr(validadeAte)} (${d.validadeDias} dias)`,
    data: dataBr(d.hoje),
    valor_total: moedaBr(total),
    valor_final: moedaBr(centavos(total - impostos)),
  };
  const t = (s: string) => trocarVariaveis(s, valores);

  let rodape = principal.rodape;
  for (const m of modelos.slice(1)) rodape = m.rodape ? juntarSemRepetir(rodape, m.rodape) : rodape;

  return {
    cor: principal.cor,
    titulo: t(principal.titulo),
    emitidaEm: d.hoje,
    validadeAte,
    pagamento: d.pagamento,
    cliente: d.cliente,
    executivo: d.executivo,
    introducao: t(principal.introducao),
    condicoes: t(principal.condicoes),
    itens,
    totais: {
      bruto,
      desconto: centavos(bruto - total),
      total,
      impostos,
      final: centavos(total - impostos),
    },
    secoes: juntarSecoes(modelos.map((m) => m.secoes)).map((s) => ({
      titulo: t(s.titulo),
      corpo: t(s.corpo),
    })),
    rodape: t(rodape),
    observacoes: d.observacoes.trim(),
    modelos: modelos.map((m) => ({ id: m.id, nome: m.nome, versao: m.versao })),
    codigosNfse: [...new Set(modelos.map((m) => m.codigo_nfse).filter((c): c is string => !!c))],
  };
}

/**
 * Qual modelo usar: os dos itens (na ordem dos itens), ou o padrão quando
 * nenhum item aponta um modelo.
 */
export function modelosDosItens(
  idsDosItens: Array<string | null | undefined>,
  padraoId: string | null,
): string[] {
  const ids = [...new Set(idsDosItens.filter((x): x is string => !!x))];
  if (ids.length > 0) return ids;
  return padraoId ? [padraoId] : [];
}

// ---------------------------------------------------------------------------
// Markdown simples → blocos (para a página e para o PDF)
// ---------------------------------------------------------------------------
export type Bloco =
  | { t: "h"; texto: string }
  | { t: "p"; linhas: string[] }
  | { t: "ul"; itens: string[] };

export function blocos(texto: string): Bloco[] {
  const out: Bloco[] = [];
  let p: string[] = [];
  let ul: string[] | null = null;
  const fecharP = () => {
    if (p.length) out.push({ t: "p", linhas: p });
    p = [];
  };
  const fecharUl = () => {
    if (ul) out.push({ t: "ul", itens: ul });
    ul = null;
  };
  for (const bruta of texto.replace(/\r/g, "").split("\n")) {
    const l = bruta.trimEnd();
    if (!l.trim()) {
      fecharP();
      fecharUl();
      continue;
    }
    const item = /^\s*[-•*]\s+(.*)$/.exec(l);
    if (item) {
      fecharP();
      ul ??= [];
      ul.push(item[1]);
      continue;
    }
    // Linha recuada logo depois de um item continua o item.
    if (ul && /^\s{2,}\S/.test(bruta)) {
      ul[ul.length - 1] += `\n${l.trim()}`;
      continue;
    }
    fecharUl();
    const h = /^#{1,3}\s+(.*)$/.exec(l);
    if (h) {
      fecharP();
      out.push({ t: "h", texto: h[1] });
      continue;
    }
    p.push(l);
  }
  fecharP();
  fecharUl();
  return out;
}

export type Trecho = { t: "txt" | "b" | "link"; v: string };

/** **negrito** e links soltos (http...). */
export function trechos(linha: string): Trecho[] {
  const out: Trecho[] = [];
  const re = /\*\*(.+?)\*\*|(https?:\/\/[^\s)]+)/g;
  let i = 0;
  for (const m of linha.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > i) out.push({ t: "txt", v: linha.slice(i, at) });
    if (m[1] != null) out.push({ t: "b", v: m[1] });
    else out.push({ t: "link", v: m[2] });
    i = at + m[0].length;
  }
  if (i < linha.length) out.push({ t: "txt", v: linha.slice(i) });
  return out;
}

export const STATUS_PROPOSTA: Record<string, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: "Rascunho", tom: "bg-muted text-muted-foreground" },
  enviada: { rotulo: "Enviada", tom: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  visualizada: { rotulo: "Visualizada", tom: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  aceita: { rotulo: "Aceita", tom: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  recusada: { rotulo: "Recusada", tom: "bg-destructive/10 text-destructive" },
  substituida: { rotulo: "Substituída", tom: "bg-muted text-muted-foreground line-through" },
  cancelada: { rotulo: "Cancelada", tom: "bg-muted text-muted-foreground" },
};
