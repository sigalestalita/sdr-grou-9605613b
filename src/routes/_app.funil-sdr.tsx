import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFunilSdr } from "@/lib/funil-sdr.functions";
import {
  FiltroPeriodo,
  periodoDoAtalho,
  periodoEmIso,
  type Periodo,
} from "@/components/filtro-periodo";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/funil-sdr")({
  head: () => ({ meta: [{ title: "Funil SDR (RD) — SDR GROU" }] }),
  component: FunilSdrPage,
});

const int = (v: number) => v.toLocaleString("pt-BR");
const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

/*
 * O relatório do RD é processado de madrugada: o que entrou hoje só aparece
 * amanhã. Este painel lê o espelho do Compass, atualizado a cada 15 minutos,
 * com as mesmas contas do relatório "Negociações concluídas".
 */
function FunilSdrPage() {
  const fetchFn = useServerFn(getFunilSdr);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("mes"));
  const [funil, setFunil] = useState<string>("");
  const { from, to } = periodoEmIso(periodo);
  const de = from ?? new Date("2020-01-01T00:00:00").toISOString();
  const ate = to ?? new Date().toISOString();

  const { data, isLoading, error } = useQuery({
    queryKey: ["funil-sdr", de, ate, funil],
    queryFn: () => fetchFn({ data: { from: de, to: ate, funil: funil || undefined } }),
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="pb-8">
      <div className="page-header sticky top-0 z-10">
        <div className="flex items-baseline gap-3">
          <h1 className="page-title">Funil SDR (RD)</h1>
          <span className="text-xs text-muted-foreground">
            {data?.atualizadoEm ? `atualizado ${quando(data.atualizadoEm)} · a cada 15 min` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
            value={funil}
            onChange={(e) => setFunil(e.target.value)}
          >
            <option value="">Todos os funis do SDR</option>
            {(data?.funis ?? []).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <FiltroPeriodo value={periodo} onChange={setPeriodo} />
        </div>
      </div>

      {error ? (
        <p className="p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Não consegui carregar o funil."}
        </p>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-background p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
            <Metric label="Negociações criadas" value={int(data.totais.criadas)} />
            <Metric
              label="Em andamento"
              value={int(data.totais.emAndamento)}
              hint="das criadas no período"
            />
            <Metric
              label="Vendidas"
              value={int(data.totais.vendidas)}
              tone="success"
              hint="fechadas no período"
            />
            <Metric
              label="Perdidas"
              value={int(data.totais.perdidas)}
              hint="fechadas no período, mesmo as criadas antes"
            />
          </div>

          <div className="space-y-4 p-4">
            <section className="surface-panel">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-semibold">Por responsável</h2>
                <span className="text-[11px] text-muted-foreground">
                  etapas: onde estão hoje as negociações criadas no período
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] tabular-nums">
                  <thead>
                    <tr className="border-b border-border text-[11px] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Responsável no RD</th>
                      <th className="px-3 py-2 text-right font-medium">Criadas</th>
                      <th className="px-3 py-2 text-right font-medium">Em andamento</th>
                      <th className="px-3 py-2 text-right font-medium">Vendidas</th>
                      <th className="px-3 py-2 text-right font-medium">Perdidas</th>
                      {data.etapas.map((e) => (
                        <th key={e} className="px-3 py-2 text-right font-medium">
                          {e}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.linhas.map((l) => (
                      <tr key={l.dono} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          {l.dono}
                          {!l.ehSdr && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              fora do rodízio
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{int(l.criadas)}</td>
                        <td className="px-3 py-2 text-right">{int(l.emAndamento)}</td>
                        <td className="px-3 py-2 text-right text-success">{int(l.vendidas)}</td>
                        <td className="px-3 py-2 text-right">{int(l.perdidas)}</td>
                        {data.etapas.map((e) => (
                          <td key={e} className="px-3 py-2 text-right text-muted-foreground">
                            {l.porEtapa[e] ? int(l.porEtapa[e]) : "·"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {data.linhas.length === 0 && (
                      <tr>
                        <td colSpan={5 + data.etapas.length} className="px-3 py-6 text-center">
                          Nenhuma negociação no período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {data.foraDoRodizio.length > 0 && (
              <section className="surface-panel">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
                  <h2 className="text-[13px] font-semibold">
                    Em andamento no nome de quem não é do rodízio
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    somem do relatório da SDR quando ela filtra por ela mesma
                  </span>
                </header>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Negociação</th>
                      <th className="px-3 py-2 text-left font-medium">Responsável</th>
                      <th className="px-3 py-2 text-left font-medium">Etapa</th>
                      <th className="px-3 py-2 text-left font-medium">Funil</th>
                      <th className="px-3 py-2 text-right font-medium">Criada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.foraDoRodizio.map((n) => (
                      <tr key={n.rd_id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <a
                            className="hover:underline"
                            href={`https://crm.rdstation.com/app/deals/${n.rd_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {n.name || "Sem nome"}
                          </a>
                        </td>
                        <td className="px-3 py-2">{n.owner_name || "—"}</td>
                        <td className="px-3 py-2">{n.stage || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{n.pipeline}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {quando(n.rd_created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "success";
  hint?: string;
}) {
  return (
    <div className="bg-background px-3 py-2.5">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`metric-value mt-0.5 text-xl ${tone === "success" ? "text-success" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
