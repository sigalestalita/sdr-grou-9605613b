import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Loader2, Plus, Save, Sparkles, Trash2, Users, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BASES,
  baseDe,
  specVazio,
  type BaseId,
  type Formato,
  type Spec,
} from "@/lib/relatorios/catalogo";
import {
  apagarRelatorio,
  listarRelatorios,
  montarRelatorio,
  rodarRelatorio,
  salvarRelatorio,
  type RelatorioSalvo,
} from "@/lib/construtor-relatorios.functions";

export const Route = createFileRoute("/_app/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios | Grou Compass" }] }),
});

const EXEMPLOS = [
  "Vendas ganhas por executivo por mês em 2026",
  "Leads por origem nos últimos 90 dias, com taxa de reunião",
  "Clientes do CS por sinaleira e responsável",
  "Pipeline aberto por funil e etapa, com valor",
];
const CORES = [
  "#1e4f9c",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#64748b",
];

function formatar(v: unknown, f?: Formato) {
  if (v == null || v === "") return "—";
  if (typeof v !== "number") return String(v);
  if (f === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (f === "percentual") return `${v.toLocaleString("pt-BR")}%`;
  return v.toLocaleString("pt-BR");
}

function RelatoriosPage() {
  const qc = useQueryClient();
  const montarFn = useServerFn(montarRelatorio);
  const rodarFn = useServerFn(rodarRelatorio);
  const listarFn = useServerFn(listarRelatorios);
  const salvarFn = useServerFn(salvarRelatorio);
  const apagarFn = useServerFn(apagarRelatorio);

  const [pedido, setPedido] = useState("");
  const [spec, setSpec] = useState<Spec>(specVazio());
  const [explicacao, setExplicacao] = useState<string | null>(null);
  const [aberto, setAberto] = useState<RelatorioSalvo | null>(null);
  const [nome, setNome] = useState("");
  const [compartilhado, setCompartilhado] = useState(false);

  const salvos = useQuery({ queryKey: ["relatorios-salvos"], queryFn: () => listarFn() });
  const rodar = useMutation({
    mutationFn: (s: Spec) => rodarFn({ data: { spec: s } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao rodar"),
  });
  const montar = useMutation({
    mutationFn: () => montarFn({ data: { pedido, atual: rodar.data || aberto ? spec : null } }),
    onSuccess: (r) => {
      setSpec(r.spec);
      setExplicacao(r.explicacao);
      if (!aberto) setNome(r.spec.titulo);
      rodar.mutate(r.spec);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao montar"),
  });
  const salvar = useMutation({
    mutationFn: (comoNovo: boolean) =>
      salvarFn({
        data: {
          id: comoNovo ? null : aberto?.meu ? aberto.id : null,
          nome: nome.trim() || spec.titulo,
          pergunta: pedido.trim() || aberto?.pergunta || null,
          spec,
          compartilhado,
        },
      }),
    onSuccess: async (r) => {
      toast.success("Relatório salvo");
      const lista = await qc.fetchQuery({
        queryKey: ["relatorios-salvos"],
        queryFn: () => listarFn(),
      });
      setAberto(lista.find((x) => x.id === r.id) ?? null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apagarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Relatório apagado");
      setAberto(null);
      void qc.invalidateQueries({ queryKey: ["relatorios-salvos"] });
    },
  });

  const abrir = (r: RelatorioSalvo) => {
    setAberto(r);
    setSpec(r.spec);
    setNome(r.nome);
    setCompartilhado(r.compartilhado);
    setPedido("");
    setExplicacao(r.pergunta ? `Pedido original: ${r.pergunta}` : null);
    rodar.mutate(r.spec);
  };
  const novo = () => {
    setAberto(null);
    setSpec(specVazio());
    setNome("");
    setCompartilhado(false);
    setPedido("");
    setExplicacao(null);
    rodar.reset();
  };

  const base = baseDe(spec.base)!;
  const mudar = (patch: Partial<Spec>) => setSpec((s) => ({ ...s, ...patch }));
  const res = rodar.data;

  const exportar = () => {
    if (!res) return;
    const cab = res.colunas.map((c) => c.nome);
    const linhas = res.linhas.map((l) =>
      res.colunas.map((c) => {
        const v = l[c.id];
        return typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "");
      }),
    );
    const csv = [cab, ...linhas]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `${(nome || spec.titulo).replace(/[^\w\-À-ú ]+/g, "")}.csv`;
    a.click();
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <Button className="w-full" variant="outline" onClick={novo}>
          <Plus className="mr-1 h-4 w-4" /> Novo relatório
        </Button>
        <Card className="space-y-1 p-2">
          <p className="px-2 pt-1 text-[12px] font-semibold text-muted-foreground">Salvos</p>
          {(salvos.data ?? []).length === 0 && (
            <p className="px-2 pb-2 text-[12px] text-muted-foreground">Nenhum relatório salvo.</p>
          )}
          {(salvos.data ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => abrir(r)}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted ${aberto?.id === r.id ? "bg-muted font-medium" : ""}`}
            >
              <span className="flex items-center gap-1">
                {r.compartilhado && <Users className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate">{r.nome}</span>
              </span>
              {!r.meu && (
                <span className="block text-[11px] text-muted-foreground">de {r.autor ?? "—"}</span>
              )}
            </button>
          ))}
        </Card>
      </aside>

      <div className="min-w-0 space-y-4">
        <Card className="space-y-3 p-4">
          <div>
            <h1 className="text-lg font-semibold">Relatórios</h1>
            <p className="text-[13px] text-muted-foreground">
              Descreva o relatório e a IA monta. Depois ajuste nos campos abaixo, salve e exporte.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && pedido.trim().length >= 3) {
                  e.preventDefault();
                  montar.mutate();
                }
              }}
              rows={2}
              placeholder={
                rodar.data || aberto
                  ? "Peça um ajuste: “só 2026”, “agrupe por funil”, “mostre o ticket médio”…"
                  : "Ex.: vendas ganhas por executivo por mês em 2026"
              }
              className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-[13px]"
            />
            <Button
              onClick={() => montar.mutate()}
              disabled={pedido.trim().length < 3 || montar.isPending}
              className="sm:self-stretch"
            >
              {montar.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              {rodar.data || aberto ? "Ajustar" : "Montar"}
            </Button>
          </div>
          {!rodar.data && !aberto && (
            <div className="flex flex-wrap gap-2">
              {EXEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setPedido(e)}
                  className="rounded-full border px-3 py-1 text-[12px] hover:bg-muted"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {explicacao && <p className="text-[12px] text-muted-foreground">{explicacao}</p>}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Campo rotulo="Base">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                value={spec.base}
                onChange={(e) =>
                  setSpec({ ...specVazio(e.target.value as BaseId), titulo: spec.titulo })
                }
              >
                {BASES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </Campo>
            {[0, 1].map((i) => (
              <Campo key={i} rotulo={i === 0 ? "Agrupar por" : "E depois por"}>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                  value={spec.dimensoes[i] ?? ""}
                  disabled={i === 1 && !spec.dimensoes[0]}
                  onChange={(e) => {
                    const d = [...spec.dimensoes];
                    if (e.target.value) d[i] = e.target.value;
                    else d.splice(i);
                    mudar({ dimensoes: d.filter(Boolean) });
                  }}
                >
                  <option value="">— nenhum —</option>
                  {base.dimensoes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            ))}
          </div>

          <Campo rotulo="Métricas (até 3)">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {base.metricas.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 text-[13px]">
                  <Checkbox
                    checked={spec.metricas.includes(m.id)}
                    onCheckedChange={(v) => {
                      const set = new Set(spec.metricas);
                      if (v) set.add(m.id);
                      else set.delete(m.id);
                      const lista = [...set].slice(0, 3);
                      mudar({ metricas: lista.length ? lista : [m.id] });
                    }}
                  />
                  {m.nome}
                </label>
              ))}
            </div>
          </Campo>

          <div className="grid gap-3 md:grid-cols-4">
            <Campo rotulo="Período por">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                value={spec.periodo?.campo ?? ""}
                onChange={(e) =>
                  mudar({
                    periodo: e.target.value
                      ? {
                          campo: e.target.value,
                          de: spec.periodo?.de ?? null,
                          ate: spec.periodo?.ate ?? null,
                        }
                      : null,
                  })
                }
              >
                <option value="">— todo o período —</option>
                {base.datas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="De">
              <Input
                type="date"
                disabled={!spec.periodo}
                value={spec.periodo?.de ?? ""}
                onChange={(e) =>
                  spec.periodo &&
                  mudar({ periodo: { ...spec.periodo, de: e.target.value || null } })
                }
              />
            </Campo>
            <Campo rotulo="Até">
              <Input
                type="date"
                disabled={!spec.periodo}
                value={spec.periodo?.ate ?? ""}
                onChange={(e) =>
                  spec.periodo &&
                  mudar({ periodo: { ...spec.periodo, ate: e.target.value || null } })
                }
              />
            </Campo>
            <Campo rotulo="Gráfico">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                value={spec.grafico}
                onChange={(e) => mudar({ grafico: e.target.value as Spec["grafico"] })}
              >
                <option value="barras">Barras</option>
                <option value="linhas">Linhas</option>
                <option value="pizza">Pizza</option>
                <option value="tabela">Só tabela</option>
              </select>
            </Campo>
          </div>

          <Campo rotulo="Filtros">
            <div className="space-y-2">
              {spec.filtros.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-[13px]"
                    value={f.campo}
                    onChange={(e) => {
                      const fs = [...spec.filtros];
                      fs[i] = { ...f, campo: e.target.value };
                      mudar({ filtros: fs });
                    }}
                  >
                    {base.dimensoes.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-[13px]"
                    value={f.operador}
                    onChange={(e) => {
                      const fs = [...spec.filtros];
                      fs[i] = { ...f, operador: e.target.value as typeof f.operador };
                      mudar({ filtros: fs });
                    }}
                  >
                    <option value="igual">é</option>
                    <option value="diferente">não é</option>
                    <option value="contem">contém</option>
                  </select>
                  <Input
                    className="w-56"
                    value={f.valor}
                    onChange={(e) => {
                      const fs = [...spec.filtros];
                      fs[i] = { ...f, valor: e.target.value };
                      mudar({ filtros: fs });
                    }}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => mudar({ filtros: spec.filtros.filter((_, j) => j !== i) })}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {spec.filtros.length < 6 && (
                <button
                  type="button"
                  className="text-[12px] text-primary hover:underline"
                  onClick={() =>
                    mudar({
                      filtros: [
                        ...spec.filtros,
                        { campo: base.dimensoes[0].id, operador: "igual", valor: "" },
                      ],
                    })
                  }
                >
                  + Adicionar filtro
                </button>
              )}
            </div>
          </Campo>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button onClick={() => rodar.mutate(spec)} disabled={rodar.isPending}>
              {rodar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Atualizar
            </Button>
            <Input
              className="w-64"
              placeholder="Nome do relatório"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <label className="flex items-center gap-1.5 text-[13px]">
              <Checkbox checked={compartilhado} onCheckedChange={(v) => setCompartilhado(!!v)} />
              Compartilhar com todos
            </label>
            <Button
              variant="outline"
              onClick={() => salvar.mutate(false)}
              disabled={salvar.isPending}
            >
              <Save className="mr-1 h-4 w-4" />
              {aberto?.meu ? "Salvar" : "Salvar relatório"}
            </Button>
            {aberto?.meu && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => salvar.mutate(true)}
                  disabled={salvar.isPending}
                >
                  Salvar como novo
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => confirm("Apagar este relatório?") && apagar.mutate(aberto.id)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Apagar
                </Button>
              </>
            )}
            {res && (
              <Button variant="ghost" className="ml-auto" onClick={exportar}>
                <Download className="mr-1 h-4 w-4" /> Exportar CSV
              </Button>
            )}
          </div>
        </Card>

        {rodar.isPending && !res && <p className="text-sm text-muted-foreground">Calculando…</p>}
        {res && <Resultado res={res} />}
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-muted-foreground">{rotulo}</p>
      {children}
    </div>
  );
}

type Res = NonNullable<Awaited<ReturnType<typeof rodarRelatorio>>>;

function Resultado({ res }: { res: Res }) {
  const dims = res.colunas.filter((c) => c.tipo === "dimensao");
  const mets = res.colunas.filter((c) => c.tipo === "metrica");
  const g = res.spec.grafico;
  const dados = useMemo(
    () =>
      res.linhas.map((l) => ({
        ...l,
        __rotulo: dims.map((d) => String(l[d.id] ?? "—")).join(" · ") || "Total",
      })),
    [res, dims],
  );
  const [aviso, setAviso] = useState(false);
  useEffect(() => setAviso(res.truncado), [res.truncado]);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{res.spec.titulo}</h2>
        <span className="text-[12px] text-muted-foreground">
          {res.registros.toLocaleString("pt-BR")} registros · {res.linhas.length} linhas
        </span>
      </div>
      {aviso && (
        <p className="text-[12px] text-warning">
          Base muito grande: o relatório considerou os primeiros 40 mil registros. Use período ou
          filtros para refinar.
        </p>
      )}

      {g !== "tabela" && dados.length > 0 && (
        <div className="h-72 w-full">
          <ResponsiveContainer>
            {g === "pizza" ? (
              <PieChart>
                <Pie
                  data={dados.slice(0, 8)}
                  dataKey={mets[0].id}
                  nameKey="__rotulo"
                  outerRadius={100}
                  label={(e) => String(e.name ?? "")}
                >
                  {dados.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatar(v, mets[0].formato)} />
              </PieChart>
            ) : g === "linhas" ? (
              <LineChart data={dados}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="__rotulo" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, n) => formatar(v, mets.find((m) => m.nome === n)?.formato)}
                />
                <Legend />
                {mets.map((m, i) => (
                  <Line key={m.id} dataKey={m.id} name={m.nome} stroke={CORES[i]} strokeWidth={2} />
                ))}
              </LineChart>
            ) : (
              <BarChart data={dados.slice(0, 40)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="__rotulo"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  height={60}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, n) => formatar(v, mets.find((m) => m.nome === n)?.formato)}
                />
                <Legend />
                {mets.map((m, i) => (
                  <Bar
                    key={m.id}
                    dataKey={m.id}
                    name={m.nome}
                    fill={CORES[i]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              {res.colunas.map((c) => (
                <th
                  key={c.id}
                  className={`px-2 py-1.5 font-medium ${c.tipo === "metrica" ? "text-right" : ""}`}
                >
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.linhas.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                {res.colunas.map((c) => (
                  <td
                    key={c.id}
                    className={`px-2 py-1.5 ${c.tipo === "metrica" ? "text-right tabular-nums" : ""}`}
                  >
                    {formatar(l[c.id], c.formato)}
                  </td>
                ))}
              </tr>
            ))}
            {res.linhas.length === 0 && (
              <tr>
                <td className="px-2 py-4 text-muted-foreground" colSpan={res.colunas.length}>
                  Nada encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
          {dims.length > 0 && res.linhas.length > 1 && (
            <tfoot className="border-t font-semibold">
              <tr>
                <td className="px-2 py-1.5" colSpan={dims.length}>
                  Total
                </td>
                {mets.map((m) => (
                  <td key={m.id} className="px-2 py-1.5 text-right tabular-nums">
                    {formatar(res.totais[m.id], m.formato)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
