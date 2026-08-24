import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCsDashboard, type CsOwnerPerformance } from "@/lib/cs-dashboard.functions";
import { useCurrentRole } from "@/lib/use-role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  HeartPulse,
  Users,
  AlertTriangle,
  CalendarCheck,
  Activity,
  DollarSign,
  ShieldAlert,
  RefreshCw,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_app/cs-dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard CS | Grou Compass" },
      {
        name: "description",
        content:
          "Métricas consolidadas de Customer Success e desempenho individual de cada liderado do time de CS.",
      },
      { property: "og:title", content: "Dashboard CS | Grou Compass" },
      {
        property: "og:description",
        content: "Sinaleira, alertas, reuniões, follow-ups e receita por CS responsável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CsDashboardPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-foreground",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function SignalBar({ s }: { s: CsOwnerPerformance["signals"] }) {
  const total = s.verde + s.amarelo + s.vermelho + s.sem_dado || 1;
  const seg = [
    { k: "verde", v: s.verde, cls: "bg-emerald-500" },
    { k: "amarelo", v: s.amarelo, cls: "bg-amber-400" },
    { k: "vermelho", v: s.vermelho, cls: "bg-red-500" },
    { k: "sem_dado", v: s.sem_dado, cls: "bg-muted" },
  ];
  return (
    <div className="flex h-2 w-28 overflow-hidden rounded-full bg-muted">
      {seg.map((x) => (
        <div key={x.k} className={x.cls} style={{ width: `${(x.v / total) * 100}%` }} />
      ))}
    </div>
  );
}

function CsDashboardPage() {
  const role = useCurrentRole();
  const fn = useServerFn(getCsDashboard);
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [sort, setSort] = useState<keyof CsOwnerPerformance>("clients");

  const enabled = !role.loading && role.canAccessAll;
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["cs-dashboard", days],
    queryFn: () => fn({ data: { days: Number(days) } }),
    enabled,
  });

  const owners = useMemo(() => {
    const list = [...(data?.owners ?? [])];
    return list.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" && typeof bv === "number") return bv - av;
      return String(av).localeCompare(String(bv));
    });
  }, [data, sort]);

  if (!role.loading && !role.canAccessAll) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">Acesso restrito</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Este dashboard é exclusivo da gestão / super admin.
          </p>
        </div>
      </div>
    );
  }

  const t = data?.totals;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard de Customer Success</h1>
          <p className="text-xs text-muted-foreground">
            Visão da gestão: saúde da carteira e desempenho de cada liderado de CS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={(v) => setDays(v as "7" | "30" | "90")}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => refetch()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {isLoading || !t ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando métricas…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Users}
              label="Clientes ativos"
              value={t.clients}
              hint={`${t.clientsEmpresa} empresas · ${t.clientsConsultoria} consultorias`}
            />
            <Kpi
              icon={HeartPulse}
              label="Health médio"
              value={t.healthAvg}
              hint={`${t.signals.verde} verdes · ${t.signals.amarelo} amarelos · ${t.signals.vermelho} vermelhos`}
            />
            <Kpi
              icon={AlertTriangle}
              label="Alertas abertos"
              value={t.alertsOpen}
              tone="text-red-500"
              hint={`${t.alertsResolved} resolvidos no período`}
            />
            <Kpi
              icon={DollarSign}
              label="Aporte da carteira"
              value={brl(t.aporte)}
              hint={`${brl(t.salesTotal)} vendido no período`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={CalendarCheck} label="Reuniões realizadas" value={t.meetingsHeld} />
            <Kpi icon={Activity} label="Interações registradas" value={t.touches} />
            <Kpi
              icon={Clock}
              label="Follow-ups pendentes"
              value={t.followUpsPending}
              hint={`${t.followUpsOverdue} atrasados`}
              tone={t.followUpsOverdue > 0 ? "text-amber-500" : "text-foreground"}
            />
            <Kpi
              icon={RefreshCw}
              label="Renovações em 60 dias"
              value={t.renewalsNext60}
              hint={`${t.staleClients} clientes sem contato há 30+ dias`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Evolução da sinaleira (semanal)</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.signalTrend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="verde" stackId="1" stroke="#10b981" fill="#10b981" />
                    <Area type="monotone" dataKey="amarelo" stackId="1" stroke="#fbbf24" fill="#fbbf24" />
                    <Area type="monotone" dataKey="vermelho" stackId="1" stroke="#ef4444" fill="#ef4444" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Atividade do time por dia</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.activityByDay}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="touches" name="Interações" fill="#003DA5" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="meetings" name="Reuniões" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Desempenho por liderado de CS</h2>
              <Select value={String(sort)} onValueChange={(v) => setSort(v as keyof CsOwnerPerformance)}>
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clients">Ordenar por carteira</SelectItem>
                  <SelectItem value="healthAvg">Ordenar por health médio</SelectItem>
                  <SelectItem value="alertsOpen">Ordenar por alertas abertos</SelectItem>
                  <SelectItem value="meetingsHeld">Ordenar por reuniões</SelectItem>
                  <SelectItem value="touches">Ordenar por interações</SelectItem>
                  <SelectItem value="followUpsOverdue">Ordenar por FUPs atrasados</SelectItem>
                  <SelectItem value="salesTotal">Ordenar por vendas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">CS</th>
                    <th className="py-2 pr-3">Carteira</th>
                    <th className="py-2 pr-3">Sinaleira</th>
                    <th className="py-2 pr-3">Health</th>
                    <th className="py-2 pr-3">Alertas</th>
                    <th className="py-2 pr-3">Reuniões</th>
                    <th className="py-2 pr-3">Interações</th>
                    <th className="py-2 pr-3">FUPs</th>
                    <th className="py-2 pr-3">Sem contato 30d</th>
                    <th className="py-2 pr-3">Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o) => (
                    <tr key={o.ownerId ?? "none"} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{o.ownerName}</td>
                      <td className="py-2 pr-3">
                        {o.clients}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({o.clientsEmpresa}E · {o.clientsConsultoria}C)
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <SignalBar s={o.signals} />
                          <span className="text-[10px] text-muted-foreground">
                            {o.signals.vermelho} vermelhos
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant="outline"
                          className={
                            o.healthAvg >= 70
                              ? "border-emerald-500/40 text-emerald-500"
                              : o.healthAvg >= 40
                                ? "border-amber-500/40 text-amber-500"
                                : "border-red-500/40 text-red-500"
                          }
                        >
                          {o.healthAvg}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={o.alertsOpen > 0 ? "text-red-500" : ""}>{o.alertsOpen}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          / {o.alertsResolved} resolv.
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {o.meetingsHeld}
                        {o.meetingsCanceled > 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({o.meetingsCanceled} canc.)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{o.touches}</td>
                      <td className="py-2 pr-3">
                        {o.followUpsPending}
                        {o.followUpsOverdue > 0 && (
                          <span className="ml-1 text-[10px] text-amber-500">
                            {o.followUpsOverdue} atras.
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{o.staleClients}</td>
                      <td className="py-2 pr-3">{brl(o.salesTotal)}</td>
                    </tr>
                  ))}
                  {owners.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-muted-foreground">
                        Nenhum dado no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
