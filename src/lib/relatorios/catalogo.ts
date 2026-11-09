import { z } from "zod";

/*
 * Catálogo do construtor de relatórios: as bases que podem ser consultadas e,
 * em cada uma, os agrupamentos (dimensões), métricas e datas liberados. A IA
 * só escolhe dentro deste catálogo e o servidor valida tudo antes de rodar:
 * ninguém (nem a IA) escreve consulta livre ao banco.
 */

export type Formato = "numero" | "moeda" | "decimal" | "percentual";
export type ItemCatalogo = { id: string; nome: string };
export type Metrica = ItemCatalogo & { formato: Formato };
export type Base = {
  id: BaseId;
  nome: string;
  descricao: string;
  dimensoes: ItemCatalogo[];
  metricas: Metrica[];
  datas: ItemCatalogo[];
};

export const BASES_IDS = ["negocios", "leads", "carteira_cs", "propostas"] as const;
export type BaseId = (typeof BASES_IDS)[number];

export const BASES: Base[] = [
  {
    id: "negocios",
    nome: "Negócios",
    descricao: "Negócios do comercial (abertos, ganhos e perdidos), com valor, funil e dono.",
    dimensoes: [
      { id: "status", nome: "Status" },
      { id: "funil", nome: "Funil" },
      { id: "etapa", nome: "Etapa" },
      { id: "dono", nome: "Dono" },
      { id: "empresa", nome: "Empresa" },
      { id: "tipo_venda", nome: "Tipo de venda" },
      { id: "fonte", nome: "Fonte" },
      { id: "temperatura", nome: "Temperatura" },
      { id: "mes_fechamento", nome: "Mês de fechamento" },
      { id: "ano_fechamento", nome: "Ano de fechamento" },
      { id: "mes_criacao", nome: "Mês de criação" },
    ],
    metricas: [
      { id: "quantidade", nome: "Quantidade", formato: "numero" },
      { id: "valor_total", nome: "Valor total", formato: "moeda" },
      { id: "ticket_medio", nome: "Ticket médio", formato: "moeda" },
    ],
    datas: [
      { id: "closed_at", nome: "Data de fechamento" },
      { id: "created_at", nome: "Data de criação" },
    ],
  },
  {
    id: "leads",
    nome: "Leads",
    descricao: "Leads do SDR (os do kanban): origem, campanha, etapa, responsável e conversão.",
    dimensoes: [
      { id: "etapa", nome: "Etapa" },
      { id: "origem", nome: "Origem" },
      { id: "canal", nome: "Canal" },
      { id: "campanha", nome: "Campanha" },
      { id: "anuncio", nome: "Anúncio" },
      { id: "formulario", nome: "Formulário" },
      { id: "tipo_lead", nome: "Tipo de lead" },
      { id: "prioridade", nome: "Prioridade" },
      { id: "responsavel", nome: "Responsável" },
      { id: "segmento", nome: "Segmento" },
      { id: "porte", nome: "Porte" },
      { id: "mes_entrada", nome: "Mês de entrada" },
      { id: "ano_entrada", nome: "Ano de entrada" },
    ],
    metricas: [
      { id: "quantidade", nome: "Quantidade", formato: "numero" },
      { id: "contatados", nome: "Contatados", formato: "numero" },
      { id: "com_reuniao", nome: "Com reunião", formato: "numero" },
      { id: "taxa_reuniao", nome: "Taxa de reunião", formato: "percentual" },
      { id: "score_medio", nome: "Score médio", formato: "decimal" },
    ],
    datas: [{ id: "created_at", nome: "Data de entrada" }],
  },
  {
    id: "carteira_cs",
    nome: "Carteira do CS",
    descricao: "Clientes ativos do Customer Success: sinaleira, saúde, renovação e responsáveis.",
    dimensoes: [
      { id: "sinaleira", nome: "Sinaleira" },
      { id: "etapa_jornada", nome: "Etapa da jornada" },
      { id: "responsavel_cs", nome: "Responsável CS" },
      { id: "responsavel_comercial", nome: "Responsável comercial" },
      { id: "tipo_lead", nome: "Tipo" },
      { id: "tipo_servico", nome: "Serviço" },
      { id: "mes_renovacao", nome: "Mês de renovação" },
    ],
    metricas: [
      { id: "quantidade", nome: "Clientes", formato: "numero" },
      { id: "saude_media", nome: "Saúde média", formato: "decimal" },
      { id: "aporte_total", nome: "Aporte total", formato: "moeda" },
    ],
    datas: [{ id: "data_renovacao", nome: "Data de renovação" }],
  },
  {
    id: "propostas",
    nome: "Propostas",
    descricao: "Propostas comerciais: status, valores e quem criou.",
    dimensoes: [
      { id: "status", nome: "Status" },
      { id: "criado_por", nome: "Criada por" },
      { id: "mes_criacao", nome: "Mês de criação" },
      { id: "mes_envio", nome: "Mês de envio" },
    ],
    metricas: [
      { id: "quantidade", nome: "Quantidade", formato: "numero" },
      { id: "valor_total", nome: "Valor total", formato: "moeda" },
      { id: "valor_medio", nome: "Valor médio", formato: "moeda" },
    ],
    datas: [
      { id: "created_at", nome: "Data de criação" },
      { id: "enviada_em", nome: "Data de envio" },
      { id: "aceita_em", nome: "Data de aceite" },
    ],
  },
];

export const baseDe = (id: string) => BASES.find((b) => b.id === id) ?? null;

export const SpecSchema = z.object({
  base: z.enum(BASES_IDS),
  titulo: z.string().max(160),
  dimensoes: z.array(z.string()).max(2),
  metricas: z.array(z.string()).min(1).max(3),
  periodo: z
    .object({
      campo: z.string(),
      de: z.string().nullable(),
      ate: z.string().nullable(),
    })
    .nullable(),
  filtros: z
    .array(
      z.object({
        campo: z.string(),
        operador: z.enum(["igual", "diferente", "contem"]),
        valor: z.string().max(200),
      }),
    )
    .max(6),
  ordenar_por: z.string().nullable(),
  ordem: z.enum(["desc", "asc"]),
  limite: z.number().int().min(1).max(500),
  grafico: z.enum(["barras", "linhas", "pizza", "tabela"]),
});
export type Spec = z.infer<typeof SpecSchema>;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Remove o que não existe na base escolhida; garante um relatório que roda. */
export function normalizarSpec(s: Spec): Spec {
  const b = baseDe(s.base)!;
  const dims = new Set(b.dimensoes.map((d) => d.id));
  const mets = new Set(b.metricas.map((m) => m.id));
  const datas = new Set(b.datas.map((d) => d.id));
  const dimensoes = [...new Set(s.dimensoes.filter((d) => dims.has(d)))].slice(0, 2);
  const metricas = [...new Set(s.metricas.filter((m) => mets.has(m)))].slice(0, 3);
  const periodo =
    s.periodo && datas.has(s.periodo.campo)
      ? {
          campo: s.periodo.campo,
          de: s.periodo.de && DATA.test(s.periodo.de) ? s.periodo.de : null,
          ate: s.periodo.ate && DATA.test(s.periodo.ate) ? s.periodo.ate : null,
        }
      : null;
  const ordenaveis = new Set([...dimensoes, ...metricas]);
  return {
    ...s,
    dimensoes,
    metricas: metricas.length ? metricas : ["quantidade"],
    periodo: periodo && (periodo.de || periodo.ate) ? periodo : null,
    filtros: s.filtros.filter((f) => dims.has(f.campo) && f.valor.trim()),
    ordenar_por: s.ordenar_por && ordenaveis.has(s.ordenar_por) ? s.ordenar_por : null,
  };
}

export function specVazio(base: BaseId = "negocios"): Spec {
  return {
    base,
    titulo: "Novo relatório",
    dimensoes: [],
    metricas: ["quantidade"],
    periodo: null,
    filtros: [],
    ordenar_por: null,
    ordem: "desc",
    limite: 100,
    grafico: "barras",
  };
}

/** Catálogo em texto, para o prompt da IA. */
export function catalogoComoTexto() {
  return BASES.map(
    (b) =>
      `## base "${b.id}" — ${b.nome}: ${b.descricao}
dimensoes: ${b.dimensoes.map((d) => `${d.id} (${d.nome})`).join(", ")}
metricas: ${b.metricas.map((m) => `${m.id} (${m.nome})`).join(", ")}
datas: ${b.datas.map((d) => `${d.id} (${d.nome})`).join(", ")}`,
  ).join("\n\n");
}
