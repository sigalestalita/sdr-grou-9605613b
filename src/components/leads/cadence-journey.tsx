import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  completeCadenceStep,
  getLeadCadence,
  setLeadCadence,
} from "@/lib/sdr-cadence.functions";
import {
  SDR_TRACKS,
  TRACK_LABEL,
  TRACK_SUBTITLE,
  type SdrTrack,
} from "@/lib/sdr-playbook";
import { TOUCH_OUTCOMES, TOUCH_OUTCOME_LABEL, channelLabel } from "@/lib/touch-types";
import {
  Route as RouteIcon,
  Check,
  Clock,
  AlertTriangle,
  Pause,
  Play,
  RotateCcw,
  Flag,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  feito: "border-emerald-500/40 bg-emerald-500/5",
  atrasado: "border-destructive/40 bg-destructive/5",
  hoje: "border-primary/50 bg-primary/5",
  futuro: "border-border bg-muted/20",
};

export function CadenceJourney({ leadId }: { leadId: string }) {
  const getFn = useServerFn(getLeadCadence);
  const setFn = useServerFn(setLeadCadence);
  const doneFn = useServerFn(completeCadenceStep);
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("sem_resposta");
  const [notes, setNotes] = useState("");
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lead-cadence", leadId],
    queryFn: () => getFn({ data: { leadId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead-cadence", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-touches", leadId] });
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["sdr-cadence-board"] });
    qc.invalidateQueries({ queryKey: ["kanban"] });
  };

  const update = useMutation({
    mutationFn: (input: { track?: SdrTrack | null; status?: "ativa" | "pausada" | "encerrada"; restart?: boolean }) =>
      setFn({ data: { leadId, ...input } }),
    onSuccess: () => { toast.success("Cadência atualizada"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const complete = useMutation({
    mutationFn: (stepId: string) =>
      doneFn({
        data: {
          leadId,
          stepId,
          outcome: outcome as (typeof TOUCH_OUTCOMES)[number],
          notes: notes.trim(),
        },
      }),
    onSuccess: (r) => {
      toast.success(r.breakup ? "Break-up registrado — cadência encerrada" : "Passo registrado na cadência");
      setExpanded(null);
      setNotes("");
      setOutcome("sem_resposta");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const plan = data?.plan;
  const visibleSteps = useMemo(() => {
    if (!plan) return [];
    if (showAll) return plan.steps;
    const pendingIdx = plan.steps.findIndex((s) => !s.done);
    if (pendingIdx < 0) return plan.steps.slice(-4);
    return plan.steps.slice(Math.max(0, pendingIdx - 2), pendingIdx + 5);
  }, [plan, showAll]);

  if (isLoading || !data || !plan) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Carregando jornada de cadência…</p>
      </Card>
    );
  }

  const status = data.lead.cadenceStatus;
  const sla = data.sla;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <RouteIcon className="h-4 w-4" /> Jornada de cadência (Playbook SDR)
          </h2>
          <p className="text-xs text-muted-foreground">
            {TRACK_LABEL[plan.track]} · {TRACK_SUBTITLE[plan.track]}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={data.lead.cadenceTrackOverride ?? "__auto"}
            onChange={(e) =>
              update.mutate({ track: e.target.value === "__auto" ? null : (e.target.value as SdrTrack) })
            }
            className="h-9 rounded-md border bg-background px-2 text-xs"
          >
            <option value="__auto">Automático (porte): {TRACK_LABEL[data.lead.suggestedTrack]}</option>
            {SDR_TRACKS.map((t) => (
              <option key={t} value={t}>{TRACK_LABEL[t]}</option>
            ))}
          </select>
          {status === "pausada" ? (
            <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "ativa" })}>
              <Play className="h-3.5 w-3.5 mr-1" /> Retomar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "pausada" })}>
              <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "ativa", restart: true })}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reiniciar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Mini label="Progresso" value={`${plan.doneCount}/${plan.total}`} />
        <Mini label="Atrasados" value={String(plan.lateCount)} alert={plan.lateCount > 0} />
        <Mini
          label="Próximo passo"
          value={plan.nextStep ? format(new Date(plan.nextStep.dueAt), "dd/MM HH:mm", { locale: ptBR }) : "—"}
        />
        <Mini
          label={`SLA 1º contato (${sla.limitMinutes}min)`}
          value={
            sla.minutes == null
              ? "—"
              : sla.status === "estourado"
                ? `estourado · ${sla.minutes}min`
                : `${sla.minutes}min`
          }
          alert={sla.status === "estourado"}
        />
      </div>

      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.round(plan.progress * 100)}%` }} />
      </div>

      {status !== "ativa" && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          {status === "pausada"
            ? "Cadência pausada — nenhum passo aparece na agenda do time."
            : "Cadência encerrada (break-up executado)."}
        </div>
      )}

      <div className="space-y-2">
        {visibleSteps.map((s) => {
          const open = expanded === s.id;
          return (
            <div key={s.id} className={`rounded-lg border p-3 space-y-2 ${STATUS_TONE[s.status]}`}>
              <button
                type="button"
                className="w-full text-left flex items-start justify-between gap-3"
                onClick={() => setExpanded(open ? null : s.id)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">Dia {s.day}</Badge>
                    <Badge variant="outline" className="text-[10px]">{s.channelTag}</Badge>
                    {s.breakup && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Flag className="h-3 w-3" /> Break-up
                      </Badge>
                    )}
                    {s.done && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-600">
                        <Check className="h-3 w-3" /> Feito
                      </Badge>
                    )}
                    {s.status === "atrasado" && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Atrasado
                      </Badge>
                    )}
                  </div>
                  <p className={`text-sm font-medium mt-1 ${s.done ? "line-through text-muted-foreground" : ""}`}>
                    {s.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(s.dueAt), "dd/MM HH:mm", { locale: ptBR })} · {channelLabel(s.channel)}
                  </p>
                </div>
                {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              </button>

              {open && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">“{s.script}”</p>
                  {!s.done && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                          className="h-9 rounded-md border bg-background px-2 text-xs"
                        >
                          {TOUCH_OUTCOMES.map((o) => (
                            <option key={o} value={o}>{TOUCH_OUTCOME_LABEL[o]}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={complete.isPending}
                          onClick={() => complete.mutate(s.id)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {complete.isPending ? "Registrando…" : "Marcar como executado"}
                        </Button>
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Observações do contato (opcional)"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </>
                  )}
                  {s.done && s.doneAt && (
                    <p className="text-[11px] text-emerald-600">
                      Executado em {format(new Date(s.doneAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
        {showAll ? "Mostrar apenas os próximos passos" : `Ver cadência completa (${plan.total} touchpoints)`}
      </Button>
    </Card>
  );
}

function Mini({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${alert ? "border-amber-500/50 bg-amber-500/10" : "bg-muted/30"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
