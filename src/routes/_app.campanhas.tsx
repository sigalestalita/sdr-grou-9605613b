import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCampanhasMeta } from "@/lib/meta-ads.functions";
import { FiltroPeriodo, periodoDoAtalho, type Periodo } from "@/components/filtro-periodo";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas Meta — SDR GROU" }] }),
  component: CampanhasPage,
});

const brl = (v: number | null | undefined, casas = 0) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      });
const int = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const diaBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hojeBr = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

function CampanhasPage() {
  const fetchFn = useServerFn(getCampanhasMeta);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("30d"));
  const [visao, setVisao] = useState<"campanhas" | "anuncios">("campanhas");
  const [soAtivas, setSoAtivas] = useState(true);
  // "Todo o período" não existe aqui: sem datas, usa os últimos 90 dias.
  const de = periodo.de || "2000-01-01";
  const ate = periodo.ate || hojeBr();

  const { data, isLoading, error } = useQuery({
    queryKey: ["campanhas-meta", de, ate],
    queryFn: () => fetchFn({ data: { de, ate } }),
  });

  const campanhas = useMemo(
    () => (data?.campanhas ?? []).filter((c) => !soAtivas || c.status === "ACTIVE" || c.gasto > 0),
    [data, soAtivas],
  );

  return (
    <div className="pb-8">
      <div className="page-header sticky top-0 z-10">
        <div className="flex items-baseline gap-3">
          <h1 className="page-title">Campanhas Meta</h1>
          <span className="text-xs text-muted-foreground">
            {data?.dadosAte
              ? `dados até ${diaBr(data.dadosAte)}${data.atualizadoEm ? ` · atualizado ${new Date(data.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}`
              : ""}
          </span>
        </div>
        <FiltroPeriodo value={periodo} onChange={setPeriodo} />
      </div>

      {error ? (
        <p className="p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Não consegui carregar as campanhas."}
        </p>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-background p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-16" />
            </div>
          ))}
        </div>
      ) : data.dadosAte == null ? (
        <div className="m-4 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          Ainda não chegaram dados da Meta. O cenário do Make "meta → Compass (desempenho diário)"
          envia o dia anterior toda madrugada; na primeira execução ele traz os últimos 90 dias.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-6">
            <Metric label="Investimento" value={brl(data.totais.gasto)} />
            <Metric label="Leads (Meta)" value={int(data.totais.leads_meta)} />
            <Metric label="Custo por lead" value={brl(data.totais.cpl, 2)} />
            <Metric label="Leads no Compass" value={int(data.totais.leads_compass)} />
            <Metric label="Reuniões" value={int(data.totais.reunioes)} tone="success" />
            <Metric label="Custo por reunião" value={brl(data.totais.custo_reuniao)} />
          </div>

          <div className="space-y-4 p-4">
            <section className="surface-panel">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-semibold">Investimento e leads por dia</h2>
                <span className="text-[11px] text-muted-foreground">
                  barras: investimento · linha: leads de formulário (Meta)
                </span>
              </header>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={data.dias}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dia" tickFormatter={diaBr} fontSize={10} minTickGap={16} />
                    <YAxis
                      yAxisId="g"
                      fontSize={10}
                      tickFormatter={(v: number) => brl(v)}
                      width={70}
                    />
                    <YAxis yAxisId="l" orientation="right" fontSize={10} width={32} />
                    <Tooltip
                      labelFormatter={(d: string) => diaBr(d)}
                      formatter={(v: number, nome: string) =>
                        nome === "gasto" ? [brl(v), "Investimento"] : [int(v), "Leads"]
                      }
                    />
                    <Bar yAxisId="g" dataKey="gasto" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                    <Line
                      yAxisId="l"
                      dataKey="leads"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                      type="linear"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="surface-panel">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-1 rounded-md bg-secondary p-0.5 text-xs">
                  {(["campanhas", "anuncios"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVisao(v)}
                      className={`rounded px-2.5 py-1 ${visao === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                    >
                      {v === "campanhas" ? "Por campanha" : "Por anúncio"}
                    </button>
                  ))}
                </div>
                {visao === "campanhas" && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      id="so-ativas"
                      type="checkbox"
                      checked={soAtivas}
                      onChange={(e) => setSoAtivas(e.target.checked)}
                    />
                    Só ativas ou com investimento no período
                  </label>
                )}
              </header>
              <div className="overflow-x-auto">
                {visao === "campanhas" ? (
                  <table className="w-full text-[12px] tabular-nums">
                    <thead>
                      <tr className="border-b border-border text-[11px] text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Campanha</th>
                        <th className="px-3 py-2 text-right font-medium">Orçamento</th>
                        <th className="px-3 py-2 text-right font-medium">Última alteração</th>
                        <th className="px-3 py-2 text-right font-medium">Investimento</th>
                        <th className="px-3 py-2 text-right font-medium">CTR</th>
                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">CPL</th>
                        <th className="px-3 py-2 text-right font-medium">No Compass</th>
                        <th className="px-3 py-2 text-right font-medium">Reuniões</th>
                        <th className="px-3 py-2 text-right font-medium">Descartados</th>
                        <th className="px-3 py-2 text-right font-medium">R$/reunião</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campanhas.map((c) => (
                        <tr key={c.campanha} className="border-b border-border/60">
                          <td className="max-w-[22rem] px-3 py-2">
                            <div className="truncate" title={c.campanha}>
                              {c.campanha}
                            </div>
                            {c.status && c.status !== "ACTIVE" && (
                              <span className="text-[10px] text-muted-foreground">
                                {c.status === "PAUSED" ? "pausada" : c.status.toLowerCase()}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {c.orcamento_diario != null
                              ? `${brl(c.orcamento_diario)}/dia`
                              : c.orcamento_total != null
                                ? `${brl(c.orcamento_total)} total`
                                : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {c.alterada_em
                              ? new Date(c.alterada_em).toLocaleString("pt-BR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{brl(c.gasto)}</td>
                          <td className="px-3 py-2 text-right">
                            {c.ctr != null ? `${c.ctr.toLocaleString("pt-BR")}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{int(c.leads_meta)}</td>
                          <td className="px-3 py-2 text-right">{brl(c.cpl, 2)}</td>
                          <td className="px-3 py-2 text-right">{int(c.leads_compass)}</td>
                          <td className="px-3 py-2 text-right">{int(c.reunioes)}</td>
                          <td className="px-3 py-2 text-right">{int(c.descartados)}</td>
                          <td className="px-3 py-2 text-right">{brl(c.custo_reuniao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-[12px] tabular-nums">
                    <thead>
                      <tr className="border-b border-border text-[11px] text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Anúncio</th>
                        <th className="px-3 py-2 text-left font-medium">Campanha · conjunto</th>
                        <th className="px-3 py-2 text-right font-medium">Investimento</th>
                        <th className="px-3 py-2 text-right font-medium">CTR</th>
                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">CPL</th>
                        <th className="px-3 py-2 text-right font-medium">No Compass</th>
                        <th className="px-3 py-2 text-right font-medium">Reuniões</th>
                        <th className="px-3 py-2 text-right font-medium">R$/reunião</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.anuncios.map((a) => (
                        <tr
                          key={`${a.campanha}|${a.anuncio}`}
                          className="border-b border-border/60"
                        >
                          <td className="max-w-[18rem] px-3 py-2">
                            <div className="truncate" title={a.anuncio}>
                              {a.anuncio}
                            </div>
                          </td>
                          <td className="max-w-[20rem] px-3 py-2 text-muted-foreground">
                            <div className="truncate" title={`${a.campanha} · ${a.conjunto ?? ""}`}>
                              {a.campanha}
                              {a.conjunto ? ` · ${a.conjunto}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">{brl(a.gasto)}</td>
                          <td className="px-3 py-2 text-right">
                            {a.ctr != null ? `${a.ctr.toLocaleString("pt-BR")}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{int(a.leads_meta)}</td>
                          <td className="px-3 py-2 text-right">{brl(a.cpl, 2)}</td>
                          <td className="px-3 py-2 text-right">{int(a.leads_compass)}</td>
                          <td className="px-3 py-2 text-right">{int(a.reunioes)}</td>
                          <td className="px-3 py-2 text-right">{brl(a.custo_reuniao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                Leads (Meta) é a contagem da Meta. No Compass, reuniões e descartados são dos leads
                que converteram no período, ligados à campanha pelo nome da campanha ou do anúncio.
                Reunião = etapa Agendado ou No-show, ou reunião marcada.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="bg-background px-3 py-2.5">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`metric-value mt-0.5 text-xl ${tone === "success" ? "text-success" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
