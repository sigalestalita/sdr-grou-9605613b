import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/settings.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import {
  FiltroPeriodo,
  periodoDoAtalho,
  periodoEmIso,
  type Periodo,
} from "@/components/filtro-periodo";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SDR GROU" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchFn = useServerFn(getDashboardStats);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("30d"));
  const [assignedTo, setAssignedTo] = useState<string>("all");

  const { from, to } = useMemo(() => periodoEmIso(periodo), [periodo]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", periodo.de, periodo.ate, assignedTo],
    queryFn: () => fetchFn({ data: { from, to, assignedTo: assignedTo === "all" ? undefined : assignedTo } }),
  });

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={assignedTo} onValueChange={setAssignedTo}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="Filtrar por SDR" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os SDRs</SelectItem>
          {(data?.sdrOptions ?? []).map((sdr) => (
            <SelectItem key={sdr.id} value={sdr.id}>
              {sdr.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FiltroPeriodo value={periodo} onChange={setPeriodo} />
    </div>
  );

  if (isLoading || !data) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Visão geral</h1>
          </div>
          {controls}
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-border bg-border md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-background p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sourceData = Object.entries(data.bySource).map(([name, count]) => ({ name, count }));
  const management = data.managementAnalytics;

  const funnelOrder = ["novo", "qualificacao", "em_contato", "aguardando", "agendado"];
  const funnelLabels: Record<string, string> = {
    novo: "Novo lead",
    qualificacao: "Em qualificação",
    em_contato: "Em contato",
    aguardando: "Aguardando retorno",
    agendado: "Agenda marcada",
  };
  const stagesByLabel: Record<string, number> = {
    "Novo lead": data.novos,
    "Em qualificação": data.qualificacao,
    "Em contato": data.em_contato,
    "Aguardando retorno": data.aguardando,
    // No-show chegou a ter agenda marcada: conta no degrau do funil.
    "Agenda marcada": data.agendados + (data.noShow ?? 0),
  };
  // Cumulative funnel: each step = leads currently in this stage OR later (more downstream).
  // Approx: count this stage + all later stages.
  const funnelCounts = funnelOrder.map((slug, i) => {
    const label = funnelLabels[slug];
    const downstream = funnelOrder.slice(i).reduce((acc, s) => acc + (stagesByLabel[funnelLabels[s]] ?? 0), 0);
    return { slug, label, count: downstream };
  });
  const topCount = funnelCounts[0]?.count || 1;

  return (
    <div className="pb-8">
      <div className="page-header sticky top-0 z-10">
        <div className="flex items-baseline gap-3">
          <h1 className="page-title">Visão geral</h1>
          <span className="text-xs text-muted-foreground">
            {assignedTo === "all" ? "Toda a operação" : data.sdrOptions.find((s) => s.id === assignedTo)?.name}
          </span>
        </div>
        {controls}
      </div>

      {/* Faixa operacional */}
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-5">
        <Metric label="Novos leads" value={data.novos} to="/kanban" />
        <Metric label="Em contato" value={data.em_contato} to="/kanban" />
        <Metric label="Aguardando retorno" value={data.aguardando} to="/kanban" />
        <Metric label="Agenda marcada" value={data.agendados} tone="success" to="/agenda" />
        <Metric
          label="Parados +3 dias"
          value={data.stalled}
          tone={data.stalled > 0 ? "danger" : undefined}
          to="/kanban"
        />
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-5">
        <Metric label="Total de leads" value={data.total} muted />
        <Metric label="Em qualificação" value={data.qualificacao} muted />
        <Metric label="Desqualificados" value={data.desqualificados} muted />
        <Metric label="Conversão lead → agenda" value={`${data.conversionRate}%`} muted />
        <Metric
          label="1ª abordagem (média)"
          value={data.avgFirstApproachMin ? `${data.avgFirstApproachMin} min` : "—"}
          muted
        />
      </div>

      <div className="space-y-4 p-4">
        <Panel
          title="Funil de evolução"
          hint="Cada etapa inclui leads que avançaram além dela"
        >
          <div className="space-y-1.5">
            {funnelCounts.map((step, i) => {
              const pctTotal = topCount ? Math.round((step.count / topCount) * 100) : 0;
              const prev = i > 0 ? funnelCounts[i - 1].count : null;
              const pctPrev = prev != null && prev > 0 ? Math.round((step.count / prev) * 100) : null;
              const widthPct = Math.max(8, pctTotal);
              return (
                <div key={step.slug} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 text-[13px] text-muted-foreground">{step.label}</div>
                  <div className="relative h-7 flex-1 overflow-hidden rounded bg-secondary">
                    <div
                      className="h-full bg-primary/70 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2.5 text-[11px]">
                      <span className="metric-value">{step.count}</span>
                      <span className="ml-1.5 text-muted-foreground">leads · {pctTotal}% do topo</span>
                    </div>
                  </div>
                  <div className="w-32 text-right text-[11px] text-muted-foreground tabular-nums">
                    {pctPrev != null ? `${pctPrev}% da etapa anterior` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px]">
            <span className="text-muted-foreground">Desqualificados (saídos do funil)</span>
            <span className="metric-value">{data.desqualificados}</span>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Por etapa">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.byStage}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={70} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Por origem">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={10} />
              <YAxis dataKey="name" type="category" fontSize={10} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        </div>

        <Panel
          title="Gestão do atendimento"
          hint="Tempos entre entrada do lead, abertura do card e avanço de etapa"
        >
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
            <Inline label="Leads tocados" value={management.summary.touchedLeads} />
            <Inline label="Cards abertos" value={management.summary.cardsOpened} />
            <Inline label="Mudanças de etapa" value={management.summary.stageMoves} />
            <Inline label="Lead → abertura" value={formatDurationMinutes(management.summary.avgLeadToOpenMin)} />
            <Inline label="Abertura → etapa" value={formatDurationMinutes(management.summary.avgOpenToStageMin)} />
          </div>

          {management.bySdr.length === 0 ? (
            <EmptyState
              title="Sem eventos no período"
              hint="Ajuste o intervalo ou o SDR selecionado para ver os tempos de atendimento."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto border-t border-border">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>SDR</th>
                    <th>Leads tocados</th>
                    <th>Cards abertos</th>
                    <th>Mud. etapa</th>
                    <th>Lead → abertura</th>
                    <th>Abertura → etapa</th>
                    <th>Lead → etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {management.bySdr.map((row) => (
                    <tr key={row.sdrId}>
                      <td className="font-medium">{row.sdrName}</td>
                      <td className="metric-value">{row.touchedLeads}</td>
                      <td className="metric-value">{row.cardsOpened}</td>
                      <td className="metric-value">{row.stageMoves}</td>
                      <td className="text-muted-foreground">{formatDurationMinutes(row.avgLeadToOpenMin)}</td>
                      <td className="text-muted-foreground">{formatDurationMinutes(row.avgOpenToStageMin)}</td>
                      <td className="text-muted-foreground">{formatDurationMinutes(row.avgLeadToStageMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Distribuição por prioridade">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Inline label="Alta" value={data.byPriority.alta} dot="var(--priority-alta)" />
            <Inline label="Média" value={data.byPriority.media} dot="var(--priority-media)" />
            <Inline label="Baixa" value={data.byPriority.baixa} dot="var(--priority-baixa)" />
            <Inline label="Fora de ICP" value={data.byPriority.fora_icp} dot="var(--priority-fora)" />
            <Inline label="Pendente" value={data.byPriority.pendente} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  muted,
  to,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger";
  muted?: boolean;
  to?: string;
}) {
  const color =
    tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  const body = (
    <div className="bg-background px-3 py-2.5 transition-colors hover:bg-secondary/40">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className={`metric-value mt-0.5 ${muted ? "text-lg text-foreground/80" : `text-xl ${color}`}`}>
        {value}
      </p>
    </div>
  );
  if (!to) return body;
  return (
    <Link to={to} className="block">
      {body}
    </Link>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Inline({ label, value, dot }: { label: string; value: string | number; dot?: string }) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="metric-value text-sm">{value}</span>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function formatDurationMinutes(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  if (value < 60) return `${value} min`;

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}min` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}