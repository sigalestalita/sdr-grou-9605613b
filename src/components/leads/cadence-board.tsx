import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { completeCadenceStep, getSdrCadenceBoard, type CadenceBoardItem } from "@/lib/sdr-cadence.functions";
import { TRACK_LABEL, SLA_FIRST_TOUCH_MINUTES } from "@/lib/sdr-playbook";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Flag, Route as RouteIcon } from "lucide-react";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const dayKey = (v: string | Date) => {
  const d = typeof v === "string" ? new Date(v) : v;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Quadro semanal com os touchpoints do playbook que cada SDR precisa executar. */
export function CadenceBoard() {
  const boardFn = useServerFn(getSdrCadenceBoard);
  const doneFn = useServerFn(completeCadenceStep);
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [owner, setOwner] = useState("me");

  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["sdr-cadence-board", from],
    queryFn: () => boardFn({ data: { from, to } }),
  });

  const complete = useMutation({
    mutationFn: (item: CadenceBoardItem) =>
      doneFn({ data: { leadId: item.leadId, stepId: item.stepId, outcome: "sem_resposta" } }),
    onSuccess: () => {
      toast.success("Touchpoint registrado");
      qc.invalidateQueries({ queryKey: ["sdr-cadence-board"] });
      qc.invalidateQueries({ queryKey: ["touch-metrics"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const assignedTo = owner === "all" ? null : owner === "me" ? (data?.currentUserId ?? null) : owner;
  const filter = (rows: CadenceBoardItem[]) =>
    assignedTo ? rows.filter((r) => r.assignedTo === assignedTo) : rows;

  const overdue = filter(data?.overdue ?? []);
  const scheduled = filter(data?.scheduled ?? []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, CadenceBoardItem[]>();
    for (const it of scheduled) {
      const k = dayKey(it.dueAt);
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }, [scheduled]);
  const todayKey = dayKey(new Date());

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <RouteIcon className="h-4 w-4" /> Cadência do playbook — semana
          </h2>
          <p className="text-xs text-muted-foreground">
            Touchpoints previstos pelo Playbook SDR por dia, com check que registra o touch no lead.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="me">Minha cadência</option>
            <option value="all">Todos os SDRs</option>
            {(data?.profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando cadência do playbook…</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="Passos atrasados" value={String(overdue.length)} alert={overdue.length > 0} />
            <Mini
              label="Hoje"
              value={String((byDay.get(todayKey) ?? []).length)}
            />
            <Mini
              label={`SLA > ${SLA_FIRST_TOUCH_MINUTES}min`}
              value={String(data.summary.slaBreached)}
              alert={data.summary.slaBreached > 0}
            />
            <Mini label="Leads sem nenhum touch" value={String(data.summary.noTouch)} alert={data.summary.noTouch > 0} />
          </div>

          {overdue.length > 0 && (
            <div className="rounded-lg border border-destructive/40 p-3 space-y-2">
              <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Atrasados ({overdue.length})
              </p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {overdue.slice(0, 60).map((it) => (
                  <StepCard key={it.key} item={it} late onDone={() => complete.mutate(it)} doing={complete.isPending} />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {days.map((d) => {
              const k = dayKey(d);
              const list = byDay.get(k) ?? [];
              const isToday = k === todayKey;
              return (
                <div
                  key={k}
                  className={`rounded-lg border p-3 min-h-[160px] space-y-2 ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {DAY_LABELS[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                    </span>
                    {list.length > 0 && <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Sem touchpoints</p>
                  ) : (
                    list.map((it) => (
                      <StepCard key={it.key} item={it} compact onDone={() => complete.mutate(it)} doing={complete.isPending} />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function StepCard({
  item,
  compact,
  late,
  onDone,
  doing,
}: {
  item: CadenceBoardItem;
  compact?: boolean;
  late?: boolean;
  onDone: () => void;
  doing: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-2 space-y-1 ${
        late ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {hhmm(item.dueAt)}
        </span>
        <Badge variant="outline" className="text-[10px]">{item.channelTag}</Badge>
      </div>
      <Link
        to="/lead/$id"
        params={{ id: item.leadId }}
        className="block text-sm font-medium hover:underline truncate"
      >
        {item.leadName}
      </Link>
      {item.company && <p className="text-[11px] text-muted-foreground truncate">{item.company}</p>}
      <p className="text-[11px] text-muted-foreground truncate">
        Dia {item.day} · {item.title}
        {item.breakup ? " · break-up" : ""}
      </p>
      {!compact && (
        <p className="text-[11px] text-muted-foreground truncate">
          {item.assignedName} · {TRACK_LABEL[item.track]}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {item.breakup && (
          <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 text-destructive">
            <Flag className="h-3 w-3" /> Break-up
          </Badge>
        )}
        <button
          type="button"
          disabled={doing}
          onClick={onDone}
          title="Registrar touchpoint como executado"
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> Feito
        </button>
      </div>
    </div>
  );
}

function Mini({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${alert ? "border-amber-500/50 bg-amber-500/10" : "bg-muted/30"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
