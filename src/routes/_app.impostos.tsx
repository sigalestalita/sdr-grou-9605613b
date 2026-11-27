import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calculator, History, Pencil, Plus, Save, Scale, Search, Trash2, X } from "lucide-react";
import {
  apagarSimulacaoImpostos,
  dadosDaCalculadora,
  empresasParaImpostos,
  excluirRegraImposto,
  historicoImpostos,
  salvarRegraImposto,
  salvarSimulacaoImpostos,
} from "@/lib/impostos-simulador.functions";
import { consultarCnpj } from "@/lib/impostos.functions";
import {
  CATEGORIAS_ESPECIAIS_ISS,
  CLASSIFICACOES,
  ehPortoAlegre,
  REGIMES,
  simular,
  tipoPessoaDoDocumento,
  type Classificacao,
  type Regime,
  type RegraImposto,
} from "@/lib/impostos/calculo";
import { moedaBr } from "@/lib/propostas/render";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Aba = "simulador" | "regras" | "historico";

export const Route = createFileRoute("/_app/impostos")({
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } =>
    s.aba === "regras" || s.aba === "historico" || s.aba === "simulador" ? { aba: s.aba } : {},
  head: () => ({ meta: [{ title: "Calculadora de impostos · Compass" }] }),
  component: CalculadoraPage,
});

const ROTULO_CL = Object.fromEntries(CLASSIFICACOES.map((c) => [c.v, c.rotulo])) as Record<
  Classificacao,
  string
>;
const sel = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";
const paraNumero = (s: string) => {
  const t = s.trim();
  if (!t) return 0;
  // "1.234,56" ou "1234.56"
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
};
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

type ItemForm = {
  key: string;
  produtoId: string | null;
  nome: string;
  classificacao: Classificacao | null;
  valor: string;
};
type ClienteForm = {
  companyId: string | null;
  nome: string;
  doc: string;
  tipo: "CPF" | "CNPJ";
  regime: Regime | "";
  municipio: string;
  especial: boolean | null;
};
type Entrada = {
  cliente: ClienteForm;
  itens: ItemForm[];
  modo: "bruto" | "liquido";
  liquido: string;
  desconto: string;
  comissao: string;
};

const novaChave = () => Math.random().toString(36).slice(2);
const ENTRADA_VAZIA: Entrada = {
  cliente: {
    companyId: null,
    nome: "",
    doc: "",
    tipo: "CNPJ",
    regime: "",
    municipio: "",
    especial: null,
  },
  itens: [{ key: novaChave(), produtoId: null, nome: "", classificacao: "treinamento", valor: "" }],
  modo: "bruto",
  liquido: "",
  desconto: "",
  comissao: "",
};

/**
 * Calculadora de impostos retidos na fonte: a mesma do negócio e da proposta,
 * aqui avulsa — vários serviços somados, a partir do bruto ou do líquido, com
 * desconto e comissão, como a calculadora que o comercial usava à parte.
 */
function CalculadoraPage() {
  const { aba = "simulador" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const dadosFn = useServerFn(dadosDaCalculadora);
  const { data } = useQuery({ queryKey: ["calculadora-impostos"], queryFn: () => dadosFn() });
  const [entrada, setEntrada] = useState<Entrada>(ENTRADA_VAZIA);

  const abas: Array<[Aba, string, typeof Calculator]> = [
    ["simulador", "Simulador", Calculator],
    ["regras", "Regras", Scale],
    ["historico", "Histórico", History],
  ];
  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">Calculadora de impostos</h1>
        <p className="text-[12px] text-muted-foreground">
          Impostos que o cliente retém na fonte ao pagar. As mesmas regras valem no negócio e na
          proposta.
        </p>
      </div>
      <div className="flex w-fit rounded-full bg-muted p-1 text-[13px]">
        {abas.map(([a, rotulo, Icone]) => (
          <button
            key={a}
            type="button"
            onClick={() => navigate({ search: { aba: a }, replace: true })}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 ${aba === a ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
          >
            <Icone className="h-3.5 w-3.5" /> {rotulo}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : aba === "simulador" ? (
        <Simulador
          entrada={entrada}
          setEntrada={setEntrada}
          regras={data.regras}
          produtos={data.produtos}
        />
      ) : aba === "regras" ? (
        <Regras regras={data.regras} produtos={data.produtos} podeEditar={data.podeEditar} />
      ) : (
        <Historico
          onAbrir={(e) => {
            setEntrada(e);
            navigate({ search: { aba: "simulador" }, replace: true });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ simulador */

type Produto = {
  id: string;
  nome: string;
  classificacao: Classificacao | null;
  preco: number | null;
};

function Simulador({
  entrada,
  setEntrada,
  regras,
  produtos,
}: {
  entrada: Entrada;
  setEntrada: (e: Entrada | ((x: Entrada) => Entrada)) => void;
  regras: RegraImposto[];
  produtos: Produto[];
}) {
  const c = entrada.cliente;
  const setC = (p: Partial<ClienteForm>) =>
    setEntrada((e) => ({ ...e, cliente: { ...e.cliente, ...p } }));
  const setItem = (key: string, p: Partial<ItemForm>) =>
    setEntrada((e) => ({ ...e, itens: e.itens.map((i) => (i.key === key ? { ...i, ...p } : i)) }));
  const poa = ehPortoAlegre(c.municipio);
  const cliente = {
    tipoPessoa: c.tipo,
    regime: c.tipo === "CNPJ" ? c.regime || null : null,
    municipio: c.municipio || null,
    categoriaEspecialIss: poa ? !!c.especial : false,
  };
  const ativas = useMemo(() => regras.filter((r) => r.ativo), [regras]);
  const itens = entrada.itens
    .filter((i) => i.classificacao || i.produtoId)
    .map((i) => ({
      nome: i.nome || (i.classificacao ? ROTULO_CL[i.classificacao] : "Serviço"),
      classificacao: i.classificacao,
      produtoId: i.produtoId,
      bruto: entrada.modo === "liquido" ? paraNumero(i.valor) || 1 : paraNumero(i.valor),
    }));
  const r = simular(
    itens,
    cliente,
    {
      modo: entrada.modo,
      liquidoAlvo: paraNumero(entrada.liquido),
      desconto: paraNumero(entrada.desconto),
      comissaoPct: paraNumero(entrada.comissao),
    },
    ativas,
  );
  const falta =
    c.tipo === "CNPJ" && !c.regime
      ? "Escolha o regime tributário do cliente"
      : poa && c.tipo === "CNPJ" && c.especial === null
        ? "Responda se o tomador é categoria especial de ISS"
        : null;

  const cnpjFn = useServerFn(consultarCnpj);
  const [receita, setReceita] = useState<string | null>(null);
  const buscar = useMutation({
    mutationFn: () => cnpjFn({ data: { cnpj: c.doc } }),
    onSuccess: (x) => {
      setC({
        tipo: "CNPJ",
        municipio: x.municipio,
        regime: x.regime,
        nome: c.nome || x.razaoSocial,
      });
      setReceita(`${x.razaoSocial} · ${x.municipio}/${x.uf} · ${x.situacao}`);
      toast.success(
        "CNPJ consultado. Lucro Real e Isento a Receita não informa: ajuste se for o caso.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const salvarFn = useServerFn(salvarSimulacaoImpostos);
  const qc = useQueryClient();
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          titulo: c.nome || null,
          companyId: c.companyId,
          entrada: entrada as unknown as Record<string, unknown>,
          resultado: r as unknown as Record<string, unknown>,
        },
      }),
    onSuccess: () => {
      toast.success("Simulação salva no histórico");
      qc.invalidateQueries({ queryKey: ["historico-impostos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <section className="surface-panel space-y-3 p-4">
          <h2 className="section-label">Cliente (tomador)</h2>
          <BuscaEmpresa
            onEscolher={(e) => {
              const tipo = tipoPessoaDoDocumento(e.cnpj) ?? "CNPJ";
              setC({
                companyId: e.id,
                nome: e.nome,
                doc: e.cnpj ?? "",
                tipo,
                regime: e.regime_tributario ?? "",
                municipio: e.cidade ?? "",
                especial: e.iss_categoria_especial ?? null,
              });
              setReceita(null);
            }}
          />
          {c.nome && (
            <p className="flex items-center gap-2 text-[12px]">
              <Badge variant="outline">{c.nome}</Badge>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setC({ ...ENTRADA_VAZIA.cliente })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px]">CNPJ / CPF</Label>
              <div className="flex gap-2">
                <Input
                  value={c.doc}
                  onChange={(e) => {
                    const t = tipoPessoaDoDocumento(e.target.value);
                    setC({ doc: e.target.value, ...(t ? { tipo: t } : {}) });
                  }}
                  placeholder="00.000.000/0000-00"
                />
                <Button
                  variant="outline"
                  disabled={buscar.isPending || c.doc.replace(/\D/g, "").length !== 14}
                  onClick={() => buscar.mutate()}
                >
                  <Search className="mr-1 h-3.5 w-3.5" /> Receita
                </Button>
              </div>
              {receita && <p className="text-[11px] text-muted-foreground">{receita}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Tipo</Label>
              <select
                className={sel}
                value={c.tipo}
                onChange={(e) => setC({ tipo: e.target.value as "CPF" | "CNPJ" })}
              >
                <option value="CNPJ">Pessoa jurídica (CNPJ)</option>
                <option value="CPF">Pessoa física (CPF)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Regime tributário</Label>
              <select
                className={sel}
                value={c.regime}
                disabled={c.tipo === "CPF"}
                onChange={(e) => setC({ regime: e.target.value as Regime })}
              >
                <option value="">Selecione</option>
                {REGIMES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px]">Município do tomador</Label>
              <Input
                value={c.municipio}
                onChange={(e) => setC({ municipio: e.target.value })}
                placeholder="Ex.: Porto Alegre"
              />
            </div>
          </div>
          {poa && c.tipo === "CNPJ" && (
            <div
              className={`space-y-2 rounded-lg border p-3 ${c.especial === null ? "border-destructive" : ""}`}
            >
              <p className="text-[13px] font-medium">
                O tomador é categoria especial de ISS em Porto Alegre?
              </p>
              <div className="flex gap-4 text-[13px]">
                {[true, false].map((v) => (
                  <label key={String(v)} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={c.especial === v}
                      onChange={() => setC({ especial: v })}
                    />
                    {v ? "Sim" : "Não"}
                  </label>
                ))}
              </div>
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">Quem é categoria especial</summary>
                <ol className="mt-1 list-decimal pl-5">
                  {CATEGORIAS_ESPECIAIS_ISS.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </section>

        <section className="surface-panel space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-label">Serviços</h2>
            <div className="flex rounded-full bg-muted p-0.5 text-[12px]">
              {(
                [
                  ["bruto", "Partir do bruto"],
                  ["liquido", "Partir do líquido"],
                ] as const
              ).map(([m, rotulo]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEntrada((e) => ({ ...e, modo: m }))}
                  className={`rounded-full px-3 py-1 ${entrada.modo === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          {entrada.modo === "liquido" && (
            <p className="text-[12px] text-muted-foreground">
              Informe quanto se quer receber líquido no total. Os valores abaixo viram o peso de
              cada serviço (deixe em branco para dividir igual).
            </p>
          )}
          <div className="space-y-2">
            {entrada.itens.map((i) => (
              <div
                key={i.key}
                className="grid gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_140px_32px]"
              >
                <select
                  className={sel}
                  value={i.produtoId ?? ""}
                  onChange={(e) => {
                    const p = produtos.find((x) => x.id === e.target.value);
                    setItem(
                      i.key,
                      p
                        ? {
                            produtoId: p.id,
                            nome: p.nome,
                            classificacao: p.classificacao,
                            valor: i.valor || (p.preco ? String(p.preco).replace(".", ",") : ""),
                          }
                        : { produtoId: null, nome: "" },
                    );
                  }}
                >
                  <option value="">Serviço avulso (escolha a classificação)</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.classificacao
                        ? ` · ${ROTULO_CL[p.classificacao]}`
                        : " · sem classificação"}
                    </option>
                  ))}
                </select>
                <select
                  className={sel}
                  value={i.classificacao ?? ""}
                  disabled={!!i.produtoId}
                  onChange={(e) =>
                    setItem(i.key, {
                      classificacao: (e.target.value || null) as Classificacao | null,
                    })
                  }
                >
                  <option value="">Classificação</option>
                  {CLASSIFICACOES.map((x) => (
                    <option key={x.v} value={x.v}>
                      {x.rotulo}
                    </option>
                  ))}
                </select>
                <Input
                  inputMode="decimal"
                  value={i.valor}
                  onChange={(e) => setItem(i.key, { valor: e.target.value })}
                  placeholder={entrada.modo === "liquido" ? "Peso (opcional)" : "Valor bruto (R$)"}
                />
                <button
                  type="button"
                  title="Remover"
                  className="grid h-9 place-items-center rounded-md text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setEntrada((e) => ({
                      ...e,
                      itens: e.itens.length > 1 ? e.itens.filter((x) => x.key !== i.key) : e.itens,
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setEntrada((e) => ({
                ...e,
                itens: [
                  ...e.itens,
                  {
                    key: novaChave(),
                    produtoId: null,
                    nome: "",
                    classificacao: "treinamento",
                    valor: "",
                  },
                ],
              }))
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar serviço
          </Button>
          <div className="grid gap-3 sm:grid-cols-3">
            {entrada.modo === "liquido" && (
              <div className="space-y-1">
                <Label className="text-[11px]">Líquido desejado (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={entrada.liquido}
                  onChange={(e) => setEntrada((x) => ({ ...x, liquido: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[11px]">Desconto (R$)</Label>
              <Input
                inputMode="decimal"
                value={entrada.desconto}
                onChange={(e) => setEntrada((x) => ({ ...x, desconto: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Comissão (% do bruto)</Label>
              <Input
                inputMode="decimal"
                value={entrada.comissao}
                onChange={(e) => setEntrada((x) => ({ ...x, comissao: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <section className="surface-panel space-y-3 p-4">
          <h2 className="section-label">Resultado</h2>
          {falta && <p className="text-[12px] text-destructive">{falta}</p>}
          <dl className="space-y-1 text-[13px]">
            <div className="flex justify-between font-semibold">
              <dt>Valor bruto (proposta)</dt>
              <dd className="tabular-nums">{moedaBr(r.bruto)}</dd>
            </div>
            {r.porImposto.map((l) => (
              <div key={l.imposto} className="flex justify-between text-muted-foreground">
                <dt>
                  {l.imposto} ({pct(l.aliquota)})
                </dt>
                <dd className="tabular-nums">− {moedaBr(l.valor)}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt>Impostos retidos ({pct(r.aliquotaEfetiva)})</dt>
              <dd className="tabular-nums">− {moedaBr(r.impostos)}</dd>
            </div>
            {r.desconto > 0 && (
              <div className="flex justify-between">
                <dt>Desconto</dt>
                <dd className="tabular-nums">− {moedaBr(r.desconto)}</dd>
              </div>
            )}
            {r.comissao > 0 && (
              <div className="flex justify-between">
                <dt>Comissão ({pct(r.comissaoPct)})</dt>
                <dd className="tabular-nums">− {moedaBr(r.comissao)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Líquido a receber</dt>
              <dd className="tabular-nums">{moedaBr(r.liquidoFinal)}</dd>
            </div>
          </dl>
          <Button
            className="w-full"
            variant="outline"
            disabled={!!falta || salvar.isPending || r.bruto <= 0}
            onClick={() => salvar.mutate()}
          >
            <Save className="mr-1 h-3.5 w-3.5" /> Salvar no histórico
          </Button>
        </section>
        {r.itens.map((i, idx) => (
          <section key={idx} className="surface-panel space-y-1 p-3 text-[12px]">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{i.nome}</span>
              <span className="tabular-nums">{moedaBr(i.bruto)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {i.classificacao ? ROTULO_CL[i.classificacao] : "Sem classificação"} · {i.regra}
            </p>
            {i.impostos.map((l, k) => (
              <div key={k} className="flex justify-between text-muted-foreground">
                <span>
                  {l.imposto} ({pct(l.aliquota)})
                </span>
                <span className="tabular-nums">{moedaBr(l.valor)}</span>
              </div>
            ))}
          </section>
        ))}
      </aside>
    </div>
  );
}

function BuscaEmpresa({
  onEscolher,
}: {
  onEscolher: (e: Awaited<ReturnType<typeof empresasParaImpostos>>[number]) => void;
}) {
  const fn = useServerFn(empresasParaImpostos);
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["impostos-empresas", q],
    queryFn: () => fn({ data: { q } }),
    enabled: q.trim().length >= 2,
  });
  return (
    <div className="relative">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar empresa da base (nome ou CNPJ) para preencher"
      />
      {q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {isFetching && <p className="p-2 text-[12px] text-muted-foreground">Buscando…</p>}
          {(data ?? []).map((e) => (
            <button
              key={e.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-muted"
              onClick={() => {
                onEscolher(e);
                setQ("");
              }}
            >
              <span className="font-medium">{e.nome}</span>
              <span className="block text-[11px] text-muted-foreground">
                {[e.cnpj, [e.cidade, e.estado].filter(Boolean).join("/"), e.regime_tributario]
                  .filter(Boolean)
                  .join(" · ") || "sem dados fiscais"}
              </span>
            </button>
          ))}
          {!isFetching && (data ?? []).length === 0 && (
            <p className="p-2 text-[12px] text-muted-foreground">Nenhuma empresa encontrada.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ regras */

type RegraTela = RegraImposto & { ordem: number };

function escopoDe(r: RegraImposto, produtos: Produto[]) {
  if (r.produtoId) return `Produto: ${produtos.find((p) => p.id === r.produtoId)?.nome ?? "—"}`;
  return r.classificacao ? ROTULO_CL[r.classificacao] : "Todos os serviços";
}

function condicoesDe(r: RegraImposto) {
  const out: string[] = [];
  if (r.tipoPessoa) out.push(r.tipoPessoa);
  if (r.regime) out.push(r.regime);
  if (r.excetoRegimes.length) out.push(`exceto ${r.excetoRegimes.join(", ")}`);
  if (r.municipio) out.push(r.municipio);
  if (r.categoriaEspecialIss) out.push("categoria especial ISS");
  if (r.valorMin != null || r.valorMax != null)
    out.push(
      r.valorMin != null && r.valorMax != null
        ? `${moedaBr(r.valorMin)} a ${moedaBr(r.valorMax)}`
        : r.valorMin != null
          ? `a partir de ${moedaBr(r.valorMin)}`
          : `até ${moedaBr(r.valorMax ?? 0)}`,
    );
  return out.length ? out.join(" · ") : "sempre";
}

function Regras({
  regras,
  produtos,
  podeEditar,
}: {
  regras: RegraTela[];
  produtos: Produto[];
  podeEditar: boolean;
}) {
  const [editando, setEditando] = useState<RegraTela | "nova" | null>(null);
  const grupos = useMemo(() => {
    const m = new Map<string, RegraTela[]>();
    for (const r of regras) {
      const k = escopoDe(r, produtos);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [regras, produtos]);
  return (
    <div className="space-y-4">
      <div className="surface-panel space-y-1 p-4 text-[12px] text-muted-foreground">
        <p>
          Como o cálculo escolhe: valem as regras do produto quando existirem (senão, as da
          classificação fiscal dele). As regras só de ISS sempre somam; entre as outras, vale a de
          maior prioridade — por isso a regra do regime (Simples, MEI, Isento) vence a da faixa de
          valor.
        </p>
        {!podeEditar && <p>Só a gestão e o administrativo alteram as regras.</p>}
      </div>
      {podeEditar && (
        <Button size="sm" onClick={() => setEditando("nova")}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Nova regra
        </Button>
      )}
      {grupos.map(([escopo, lista]) => (
        <section key={escopo} className="surface-panel overflow-x-auto">
          <h2 className="section-label px-4 pt-3">{escopo}</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Regra</th>
                <th>Quando</th>
                <th>Impostos retidos</th>
                <th>Prioridade</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className={r.ativo ? "" : "opacity-50"}>
                  <td>
                    <span className="font-medium">{r.nome}</span>
                    {!r.ativo && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        inativa
                      </Badge>
                    )}
                    {r.observacoes && (
                      <span className="block max-w-[420px] text-[11px] text-muted-foreground">
                        {r.observacoes}
                      </span>
                    )}
                  </td>
                  <td className="text-[12px]">{condicoesDe(r)}</td>
                  <td className="text-[12px]">
                    {r.itens.length
                      ? r.itens.map((i) => `${i.imposto} ${pct(i.aliquota)}`).join(" + ")
                      : "nenhum"}
                  </td>
                  <td className="text-[12px]">{r.prioridade}</td>
                  <td>
                    {podeEditar && (
                      <Button size="sm" variant="ghost" onClick={() => setEditando(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {editando && (
        <EditorRegra
          regra={editando === "nova" ? null : editando}
          produtos={produtos}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function EditorRegra({
  regra,
  produtos,
  onClose,
}: {
  regra: RegraTela | null;
  produtos: Produto[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarRegraImposto);
  const excluirFn = useServerFn(excluirRegraImposto);
  const [f, setF] = useState(() => ({
    nome: regra?.nome ?? "",
    escopo: regra?.produtoId
      ? "produto"
      : regra?.classificacao
        ? "classificacao"
        : regra
          ? "todos"
          : "classificacao",
    classificacao: (regra?.classificacao ?? "treinamento") as Classificacao,
    produtoId: regra?.produtoId ?? "",
    tipoPessoa: regra?.tipoPessoa ?? "",
    regime: regra?.regime ?? "",
    excetoRegimes: regra?.excetoRegimes ?? [],
    municipio: regra?.municipio ?? "",
    categoriaEspecialIss: regra?.categoriaEspecialIss ?? false,
    valorMin: regra?.valorMin != null ? String(regra.valorMin).replace(".", ",") : "",
    valorMax: regra?.valorMax != null ? String(regra.valorMax).replace(".", ",") : "",
    prioridade: String(regra?.prioridade ?? 10),
    itens: (regra?.itens ?? []).map((i) => ({
      imposto: i.imposto,
      aliquota: String(i.aliquota).replace(".", ","),
    })),
    observacoes: regra?.observacoes ?? "",
    ativo: regra?.ativo ?? true,
  }));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const fechar = () => {
    qc.invalidateQueries({ queryKey: ["calculadora-impostos"] });
    onClose();
  };
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          id: regra?.id ?? null,
          nome: f.nome,
          classificacao: f.escopo === "classificacao" ? f.classificacao : null,
          produtoId: f.escopo === "produto" && f.produtoId ? f.produtoId : null,
          tipoPessoa: (f.tipoPessoa || null) as "CPF" | "CNPJ" | null,
          regime: (f.regime || null) as Regime | null,
          excetoRegimes: f.excetoRegimes as Regime[],
          municipio: f.municipio.trim() || null,
          categoriaEspecialIss: f.categoriaEspecialIss,
          valorMin: f.valorMin.trim() ? paraNumero(f.valorMin) : null,
          valorMax: f.valorMax.trim() ? paraNumero(f.valorMax) : null,
          prioridade: Math.round(paraNumero(f.prioridade)),
          itens: f.itens
            .filter((i) => i.imposto.trim())
            .map((i) => ({
              imposto: i.imposto.trim().toUpperCase(),
              aliquota: paraNumero(i.aliquota),
            })),
          observacoes: f.observacoes.trim() || null,
          ativo: f.ativo,
        },
      }),
    onSuccess: () => {
      toast.success("Regra salva");
      fechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const excluir = useMutation({
    mutationFn: () => excluirFn({ data: { id: regra!.id } }),
    onSuccess: () => {
      toast.success("Regra excluída");
      fechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{regra ? "Editar regra" : "Nova regra"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Nome</Label>
            <Input value={f.nome} onChange={(e) => set({ nome: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Vale para</Label>
            <select
              className={sel}
              value={f.escopo}
              onChange={(e) => set({ escopo: e.target.value })}
            >
              <option value="classificacao">Uma classificação fiscal</option>
              <option value="produto">Um produto do catálogo (exceção)</option>
              <option value="todos">Todos os serviços</option>
            </select>
          </div>
          {f.escopo === "classificacao" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Classificação</Label>
              <select
                className={sel}
                value={f.classificacao}
                onChange={(e) => set({ classificacao: e.target.value as Classificacao })}
              >
                {CLASSIFICACOES.map((x) => (
                  <option key={x.v} value={x.v}>
                    {x.rotulo}
                  </option>
                ))}
              </select>
            </div>
          )}
          {f.escopo === "produto" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Produto</Label>
              <select
                className={sel}
                value={f.produtoId}
                onChange={(e) => set({ produtoId: e.target.value })}
              >
                <option value="">Selecione</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px]">Tipo de pessoa</Label>
            <select
              className={sel}
              value={f.tipoPessoa}
              onChange={(e) => set({ tipoPessoa: e.target.value })}
            >
              <option value="">Qualquer</option>
              <option value="CNPJ">CNPJ</option>
              <option value="CPF">CPF</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Regime do cliente</Label>
            <select
              className={sel}
              value={f.regime}
              onChange={(e) => set({ regime: e.target.value })}
            >
              <option value="">Qualquer</option>
              {REGIMES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Não vale para os regimes</Label>
            <div className="flex flex-wrap gap-3 text-[12px]">
              {REGIMES.map((x) => (
                <label key={x} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={f.excetoRegimes.includes(x)}
                    onChange={(e) =>
                      set({
                        excetoRegimes: e.target.checked
                          ? [...f.excetoRegimes, x]
                          : f.excetoRegimes.filter((y) => y !== x),
                      })
                    }
                  />
                  {x}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Município do tomador</Label>
            <Input
              value={f.municipio}
              onChange={(e) => set({ municipio: e.target.value })}
              placeholder="Qualquer"
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <input
              type="checkbox"
              checked={f.categoriaEspecialIss}
              onChange={(e) => set({ categoriaEspecialIss: e.target.checked })}
            />
            Só tomador de categoria especial de ISS
          </label>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor bruto a partir de (R$)</Label>
            <Input
              inputMode="decimal"
              value={f.valorMin}
              onChange={(e) => set({ valorMin: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor bruto até (R$)</Label>
            <Input
              inputMode="decimal"
              value={f.valorMax}
              onChange={(e) => set({ valorMax: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Prioridade (maior vence)</Label>
            <Input
              inputMode="numeric"
              value={f.prioridade}
              onChange={(e) => set({ prioridade: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <input
              type="checkbox"
              checked={f.ativo}
              onChange={(e) => set({ ativo: e.target.checked })}
            />
            Regra ativa
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-[11px]">Impostos retidos</Label>
            {f.itens.map((i, k) => (
              <div key={k} className="flex gap-2">
                <Input
                  className="w-40"
                  value={i.imposto}
                  onChange={(e) =>
                    set({
                      itens: f.itens.map((x, j) =>
                        j === k ? { ...x, imposto: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Ex.: IRRF"
                />
                <Input
                  className="w-28"
                  inputMode="decimal"
                  value={i.aliquota}
                  onChange={(e) =>
                    set({
                      itens: f.itens.map((x, j) =>
                        j === k ? { ...x, aliquota: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="%"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set({ itens: f.itens.filter((_, j) => j !== k) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => set({ itens: [...f.itens, { imposto: "", aliquota: "" }] })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Imposto
            </Button>
            {f.itens.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Sem impostos = regra de “não reter”.
              </p>
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Observações</Label>
            <textarea
              className="min-h-[70px] w-full rounded-md border bg-background p-2 text-[13px]"
              value={f.observacoes}
              onChange={(e) => set({ observacoes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          {regra && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              disabled={excluir.isPending}
              onClick={() => window.confirm(`Excluir a regra "${regra.nome}"?`) && excluir.mutate()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!f.nome.trim() || salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ histórico */

function Historico({ onAbrir }: { onAbrir: (e: Entrada) => void }) {
  const fn = useServerFn(historicoImpostos);
  const apagarFn = useServerFn(apagarSimulacaoImpostos);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["historico-impostos"], queryFn: () => fn() });
  const apagar = useMutation({
    mutationFn: (id: string) => apagarFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["historico-impostos"] }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data?.length)
    return (
      <p className="surface-panel p-4 text-sm text-muted-foreground">
        Nenhuma simulação salva ainda. No simulador, use “Salvar no histórico”.
      </p>
    );
  return (
    <section className="surface-panel overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Cliente</th>
            <th>Quem</th>
            <th>Bruto</th>
            <th>Impostos</th>
            <th>Líquido</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.id}>
              <td className="whitespace-nowrap text-[12px]">
                {new Date(s.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </td>
              <td>{s.titulo ?? "—"}</td>
              <td className="text-[12px]">{s.autor}</td>
              <td className="tabular-nums">{moedaBr(s.bruto)}</td>
              <td className="tabular-nums">{moedaBr(s.impostos)}</td>
              <td className="tabular-nums">{moedaBr(s.liquido)}</td>
              <td className="whitespace-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAbrir({
                      ...ENTRADA_VAZIA,
                      ...(JSON.parse(s.entradaJson) as Partial<Entrada>),
                    })
                  }
                >
                  Abrir
                </Button>
                {s.meu && (
                  <Button size="sm" variant="ghost" onClick={() => apagar.mutate(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
