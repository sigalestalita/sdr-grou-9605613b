import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTouchMetrics, getTouchRules, saveTouchRules } from "@/lib/touches.functions";
import { DEFAULT_TOUCH_RULES, channelLabel } from "@/lib/touch-types";
import { Activity, AlertTriangle, Clock, Target, Users } from "lucide-react";

export const Route = createFileRoute("/_app/cadencia")({
  component: CadenciaPage,
  head: () => ({
    meta: [
      { title: "Cadência e Touches | Grou Compass" },
      { name: "description", content: "Gestão da cadência comercial: touches por SDR, taxa de resposta por canal e leads esquecidos." },
      { property: "og:title", content: "Cadência e Touches | Grou Compass" },
      { property: "og:description", content: "Indicadores operacionais de cadência e follow-up do time de SDR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const pct = (n: number) => `${Math.round(n * 100)}%`;

function CadenciaPage() {
  const metricsFn = useServerFn(getTouchMetrics);
  const rulesFn = useServerFn(getTouchRules);
  const saveRulesFn = useServerFn(saveTouchRules);
  const qc = useQueryClient();
  const [days, setDays] = useState(30);

  const from = new Date(Date.now() - days * 86400000).toISOString();
  const { data, isLoading } = useQuery({
    queryKey: ["touch-metrics", days],
    queryFn: () => metricsFn({ data: { from } }),
  });
  const { data: rules } = useQuery({ queryKey: ["touch-rules"], queryFn: () => rulesFn({}) });

  const [draft, setDraft] = useState(DEFAULT_TOUCH_RULES);
  useEffect(() => { if (rules) setDraft(rules); }, [rules]);

  const save = useMutation({
    mutationFn: (input: typeof DEFAULT_TOUCH_RULES) => saveRulesFn({ data: input }),
    onSuccess: () => {
      toast.success("Regras de cadência salvas");
      qc.invalidateQueries({ queryKey: ["touch-rules"] });
      qc.invalidateQueries({ queryKey: ["touch-metrics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const op = data?.operation;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5" /> Cadência e Touches
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestão operacional do processo comercial: esforço, canais e follow-ups.
          </p>
        </div>
        <select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="7">Últimos 7 dias</option>
          <option value="15">Últimos 15 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>
      </header>

      <CadenceBoard />



      {isLoading || !op ? (
        <p className="text-sm text-muted-foreground">Carregando métricas…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<Users className="h-4 w-4" />} label="Leads no período" value={String(op.leads)} />
            <Kpi icon={<Activity className="h-4 w-4" />} label="Touches registrados" value={String(op.totalTouches)} />
            <Kpi icon={<Target className="h-4 w-4" />} label="Touches até reunião" value={String(op.avgTouchesUntilMeeting)} />
            <Kpi icon={<Target className="h-4 w-4" />} label="Touches até descarte" value={String(op.avgTouchesUntilDiscard)} />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Follow-ups vencidos" value={String(op.pendingFollowUps)} alert={op.pendingFollowUps > 0} />
            <Kpi icon={<Clock className="h-4 w-4" />} label="Follow-ups agendados" value={String(op.scheduledFollowUps)} />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Leads sem nenhum touch" value={String(op.leadsWithoutTouch)} alert={op.leadsWithoutTouch > 0} />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label={`Esquecidos (>${data.rules.staleTouchDays}d)`} value={String(op.forgottenLeads)} alert={op.forgottenLeads > 0} />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label={`Parados na etapa (>${data.rules.staleStageDays}d)`} value={String(op.stuckInStage)} alert={op.stuckInStage > 0} />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label={`Descartados < ${data.rules.minTouchesBeforeDiscard} touches`} value={String(op.abandonedBelowMin)} alert={op.abandonedBelowMin > 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Taxa de resposta por canal</h2>
              {op.channelStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem touches no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="text-left py-1">Canal</th><th className="text-right">Touches</th><th className="text-right">Respostas</th><th className="text-right">Taxa</th></tr>
                  </thead>
                  <tbody>
                    {op.channelStats.map((c) => (
                      <tr key={c.channel} className="border-t">
                        <td className="py-1.5">{channelLabel(c.channel)}</td>
                        <td className="text-right">{c.touches}</td>
                        <td className="text-right">{c.responses}</td>
                        <td className="text-right font-medium">{pct(c.responseRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold mb-3">Resposta por número do touch</h2>
              {op.responseByTouchNumber.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem touches no período.</p>
              ) : (
                <div className="space-y-2">
                  {op.responseByTouchNumber.map((r) => (
                    <div key={r.touchNumber} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-muted-foreground">Touch {r.touchNumber}</span>
                      <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, r.responseRate * 100)}%` }} />
                      </div>
                      <span className="w-20 text-right">{pct(r.responseRate)} ({r.touches})</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5 overflow-x-auto">
            <h2 className="font-semibold mb-3">Desempenho por SDR</h2>
            {data.bySdr.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum SDR com atividade no período.</p>
            ) : (
              <table className="w-full text-sm min-w-[820px]">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">SDR</th>
                    <th className="text-right">Leads</th>
                    <th className="text-right">Touches</th>
                    <th className="text-right">Média/lead</th>
                    <th className="text-left pl-3">Canal principal</th>
                    <th className="text-right">Intervalo médio</th>
                    <th className="text-right">Tempo até resposta</th>
                    <th className="text-right">Abandonos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySdr.map((s) => (
                    <tr key={s.userId} className="border-t align-top">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="text-right">{s.leads}</td>
                      <td className="text-right">{s.touches}</td>
                      <td className="text-right">{s.avgTouchesPerLead}</td>
                      <td className="pl-3">{s.topChannel ? channelLabel(s.topChannel) : "—"}</td>
                      <td className="text-right">{s.avgHoursBetweenTouches != null ? `${s.avgHoursBetweenTouches}h` : "—"}</td>
                      <td className="text-right">{s.avgHoursToResponse != null ? `${s.avgHoursToResponse}h` : "—"}</td>
                      <td className="text-right">
                        {s.abandonedBelowMin > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/50">{s.abandonedBelowMin}</Badge>
                        ) : "0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-5 overflow-x-auto">
            <h2 className="font-semibold mb-1">Conversão por quantidade de touches</h2>
            <p className="text-xs text-muted-foreground mb-3">Leads que agendaram reunião conforme o esforço aplicado.</p>
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-1">SDR</th>
                  {["0", "1-2", "3-5", "6+"].map((b) => (
                    <th key={b} className="text-right">{b} touches</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bySdr.map((s) => (
                  <tr key={`c-${s.userId}`} className="border-t">
                    <td className="py-2">{s.name}</td>
                    {s.conversionByTouches.map((c) => (
                      <td key={c.bucket} className="text-right">
                        {c.leads === 0 ? "—" : `${pct(c.rate)} (${c.meetings}/${c.leads})`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Regras de cadência</h2>
          <p className="text-xs text-muted-foreground">
            Usadas nos alertas do Kanban e no bloqueio de descarte precoce (apenas gestão pode salvar).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mínimo de touches antes de descartar</label>
            <Input
              type="number"
              min={0}
              value={draft.minTouchesBeforeDiscard}
              onChange={(e) => setDraft({ ...draft, minTouchesBeforeDiscard: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Dias sem touch = esquecido</label>
            <Input
              type="number"
              min={1}
              value={draft.staleTouchDays}
              onChange={(e) => setDraft({ ...draft, staleTouchDays: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Dias parado na etapa = alerta</label>
            <Input
              type="number"
              min={1}
              value={draft.staleStageDays}
              onChange={(e) => setDraft({ ...draft, staleStageDays: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(draft)}>
            {save.isPending ? "Salvando…" : "Salvar regras"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <Card className={`p-4 ${alert ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}
