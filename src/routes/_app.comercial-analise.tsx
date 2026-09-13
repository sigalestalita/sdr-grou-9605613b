import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, CalendarClock, Users } from "lucide-react";
import { getComercialAnalise } from "@/lib/comercial.functions";
import { moeda } from "@/lib/comercial/metas";
import type { Fatia } from "@/lib/comercial/analise";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/comercial-analise")({
  component: AnalisePage,
  head: () => ({
    meta: [
      { title: "Análise comercial | Grou Compass" },
      {
        name: "description",
        content: "Evolução das vendas, conversão do funil, origem, perdas e ranking do time.",
      },
    ],
  }),
});

/* Uma cor por gráfico, porque toda série aqui é de magnitude. Identidade só
   aparece nas cores de estado (ganho e perda), que vêm sempre com rótulo. */
const HUE = "var(--chart-comercial, #4f7fe8)";
const HUE_PERDA = "var(--chart-perda, #d9636b)";

const moedaCurta = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
    : v >= 1000
      ? `${Math.round(v / 1000)}k`
      : String(Math.round(v));

/**
 * Análise comercial. Cada bloco responde a uma pergunta que a gestora fez no
 * briefing: como estamos evoluindo, onde o funil trava, de onde vem a venda,
 * por que perdemos e como o time se compara.
 */
function AnalisePage() {
  const fn = useServerFn(getComercialAnalise);
  const [meses, setMeses] = useState("12");
  const [pipeline, setPipeline] = useState("todos");
  const [executivo, setExecutivo] = useState("todos");

  const q = useQuery({
    queryKey: ["comercial-analise", meses, pipeline, executivo],
    queryFn: () =>
      fn({
        data: {
          meses: Number(meses),
          ...(pipeline !== "todos" ? { pipelineId: pipeline } : {}),
          ...(executivo !== "todos" ? { executivoId: executivo } : {}),
        },
      }),
    staleTime: 5 * 60_000,
  });
  const d = q.data;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            Análise comercial
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Como as vendas evoluem, onde o funil trava, de onde vem o que fecha e por que a gente
            perde.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d?.isManager && (
            <Select value={executivo} onValueChange={setExecutivo}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <Users className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo o time</SelectItem>
                {(d?.executivos ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={pipeline} onValueChange={setPipeline}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Funil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os funis</SelectItem>
              {(d?.pipelines ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={meses} onValueChange={setMeses}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <CalendarClock className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
              <SelectItem value="24">Últimos 24 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {q.isLoading && <p className="text-[13px] text-muted-foreground">Carregando…</p>}
      {q.error && (
        <p className="text-[13px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Erro ao carregar"}
        </p>
      )}

      {d && (
        <>
          {!d.temColunasNovas && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                A migration do módulo comercial ainda não foi aplicada, então a venda ganha está
                sendo contada pela data de fechamento antiga. Depois de aplicá-la, passa a valer a
                ordem de compra.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile
              label="Valor ganho"
              valor={moeda(d.resumo.valorGanho)}
              hint={`${d.resumo.quantidade} vendas`}
            />
            <Tile label="Ticket médio" valor={moeda(d.resumo.ticketMedio)} />
            <Tile
              label="Taxa de vitória"
              valor={d.resumo.taxaVitoria !== null ? `${d.resumo.taxaVitoria}%` : "—"}
              hint="do que foi decidido"
            />
            <Tile
              label="Ciclo de venda"
              valor={d.resumo.cicloDias !== null ? `${d.resumo.cicloDias} dias` : "—"}
              hint="mediana, da criação ao ganho"
            />
            <Tile
              label="Em aberto"
              valor={String(d.resumo.abertos)}
              hint={moeda(d.resumo.valorAberto)}
            />
          </div>

          {/* ---------- evolução ---------- */}
          <Bloco
            titulo="Vendas por mês"
            sub="Valor fechado a cada mês. O número embaixo é a quantidade de vendas."
          >
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.serieMensal} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="rotulo"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickFormatter={moedaCurta}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--foreground)",
                    }}
                    formatter={(v: number, nome: string) =>
                      nome === "valor" ? [moeda(v), "Valor ganho"] : [v, nome]
                    }
                  />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill={HUE} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex gap-1 px-2 text-center text-[10px] text-muted-foreground">
              {d.serieMensal.map((p) => (
                <span key={p.chave} className="flex-1 tabular-nums" title={`${p.perdidos} perdas`}>
                  {p.quantidade || "—"}
                </span>
              ))}
            </div>
          </Bloco>

          {/* ---------- funil ---------- */}
          <Bloco
            titulo="Onde o funil trava"
            sub="Negócios abertos por etapa. A porcentagem é quanto passou da etapa anterior."
          >
            {d.funil.length === 0 ? (
              <Vazio>Nenhum negócio aberto nesse recorte.</Vazio>
            ) : (
              <ul className="space-y-2">
                {d.funil.map((e) => {
                  const maior = Math.max(1, ...d.funil.map((x) => x.quantidade));
                  return (
                    <li key={e.stageId} className="flex items-center gap-2 text-[12px]">
                      <span className="w-48 shrink-0 truncate text-muted-foreground" title={e.nome}>
                        {e.nome}
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                        <span
                          className="block h-full rounded-sm"
                          style={{
                            width: `${Math.round((e.quantidade / maior) * 100)}%`,
                            background: HUE,
                          }}
                        />
                      </span>
                      <span className="w-10 text-right font-medium tabular-nums">
                        {e.quantidade}
                      </span>
                      <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {moedaCurta(e.valor)}
                      </span>
                      <span
                        className={`w-14 text-right tabular-nums ${
                          e.conversao !== null && e.conversao < 40
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {e.conversao !== null ? `${e.conversao}%` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Bloco>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloco titulo="De onde vem a venda" sub="Origem dos negócios ganhos, por valor.">
              <Barras fatias={d.origens} cor={HUE} />
            </Bloco>
            <Bloco titulo="Por que perdemos" sub="Motivo registrado nos negócios perdidos.">
              <Barras fatias={d.motivosPerda} cor={HUE_PERDA} porQuantidade />
            </Bloco>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloco titulo="O que vendemos" sub="Tipo de venda dos negócios ganhos, por valor.">
              <Barras fatias={d.tiposVenda} cor={HUE} />
            </Bloco>

            <Bloco titulo="Ranking do time" sub="Valor ganho no período, com a taxa de vitória.">
              {d.ranking.length === 0 ? (
                <Vazio>Nenhuma venda registrada no período.</Vazio>
              ) : (
                <ul className="space-y-2">
                  {d.ranking.map((p) => {
                    const maior = Math.max(1, ...d.ranking.map((x) => x.valor));
                    return (
                      <li key={p.id} className="flex items-center gap-2 text-[12px]">
                        <span className="w-32 shrink-0 truncate" title={p.nome}>
                          {p.nome}
                        </span>
                        <span className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                          <span
                            className="block h-full rounded-sm"
                            style={{
                              width: `${Math.round((p.valor / maior) * 100)}%`,
                              background: HUE,
                            }}
                          />
                        </span>
                        <span className="w-16 text-right font-medium tabular-nums">
                          {moedaCurta(p.valor)}
                        </span>
                        <span className="w-16 text-right tabular-nums text-muted-foreground">
                          {p.quantidade} · {p.taxa !== null ? `${p.taxa}%` : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Bloco>
          </div>
        </>
      )}
    </div>
  );
}

function Barras({
  fatias,
  cor,
  porQuantidade,
}: {
  fatias: Fatia[];
  cor: string;
  porQuantidade?: boolean;
}) {
  if (fatias.length === 0) return <Vazio>Sem dado no período.</Vazio>;
  const valorDe = (f: Fatia) => (porQuantidade ? f.quantidade : f.valor);
  const maior = Math.max(1, ...fatias.map(valorDe));
  return (
    <ul className="space-y-2">
      {fatias.map((f) => (
        <li key={f.nome} className="flex items-center gap-2 text-[12px]">
          <span className="w-40 shrink-0 truncate text-muted-foreground" title={f.nome}>
            {f.nome}
          </span>
          <span className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            <span
              className="block h-full rounded-sm"
              style={{ width: `${Math.round((valorDe(f) / maior) * 100)}%`, background: cor }}
            />
          </span>
          <span className="w-20 text-right font-medium tabular-nums">
            {porQuantidade ? f.quantidade : moedaCurta(f.valor)}
          </span>
          {!porQuantidade && (
            <span className="w-8 text-right tabular-nums text-muted-foreground">
              {f.quantidade}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Bloco({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-4">
      <h2 className="text-[13px] font-semibold">{titulo}</h2>
      {sub && <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      {children}
    </section>
  );
}

function Tile({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="surface-panel p-3">
      <p className="section-label">{label}</p>
      <p className="metric-value mt-1 text-xl tabular-nums">{valor}</p>
      {hint && <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-[12px] text-muted-foreground">{children}</p>;
}
