import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { completeAutoFup, getFupAgenda } from "@/lib/fup-agenda.functions";
import { setFollowUpDone } from "@/lib/touches.functions";
import { channelLabel } from "@/lib/touch-types";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Bot,
  User,
  MessageCircle,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/_app/agenda")({
  component: AgendaPage,
  head: () => ({
    meta: [
      { title: "Agenda de FUPs | Lidi CRM" },
      {
        name: "description",
        content: "Cronograma semanal de follow-ups: o que cada SDR precisa fazer em cada touchpoint do atendimento.",
      },
      { property: "og:title", content: "Agenda de FUPs | Lidi CRM" },
      { property: "og:description", content: "Calendário de follow-ups manuais e automáticos por SDR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

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
const dayKey = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function AgendaPage() {
  const agendaFn = useServerFn(getFupAgenda);
  const doneFn = useServerFn(setFollowUpDone);
  const autoDoneFn = useServerFn(completeAutoFup);
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [owner, setOwner] = useState<string>("me");

  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["fup-agenda", from],
    queryFn: () => agendaFn({ data: { from, to } }),
  });

  const complete = useMutation({
    mutationFn: async (item: Item) => {
      if (item.kind === "auto") {
        await autoDoneFn({ data: { enrollmentId: item.key.replace("auto:", "") } });
      } else if (item.kind === "touch") {
        await doneFn({ data: { leadId: item.leadId, touchId: item.touchId!, done: !item.done } });
      } else {
        await doneFn({ data: { leadId: item.leadId, done: true } });
      }
    },
    onSuccess: () => {
      toast.success("Follow-up atualizado");
      qc.invalidateQueries({ queryKey: ["fup-agenda"] });
      qc.invalidateQueries({ queryKey: ["lead-touches"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const assignedTo = owner === "all" ? null : owner === "me" ? (data?.currentUserId ?? null) : owner;

  const filter = <T extends { assignedTo: string | null }>(rows: T[]) =>
    assignedTo ? rows.filter((r) => r.assignedTo === assignedTo) : rows;

  const overdue = filter(data?.overdue ?? []);
  const scheduled = filter(data?.scheduled ?? []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, typeof scheduled>();
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
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Agenda de FUPs
          </h1>
          <p className="text-sm text-muted-foreground">
            Cronograma dos próximos touchpoints — follow-ups manuais e sequências automáticas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="me">Minha agenda</option>
            <option value="all">Todos os SDRs</option>
            {(data?.profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
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
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Atrasados" value={String(overdue.length)} tone="danger" />
            <Kpi label="Hoje" value={String((byDay.get(todayKey) ?? []).filter((i) => !i.done).length)} />
            <Kpi label="Pendentes na semana" value={String(scheduled.filter((i) => !i.done).length)} />
            <Kpi label="Realizados na semana" value={String(scheduled.filter((i) => i.done).length)} />
          </div>

          {overdue.length > 0 && (
            <Card className="p-4 border-destructive/40">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Atrasados ({overdue.length})
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {overdue.slice(0, 60).map((it) => (
                  <AgendaItem key={it.key} item={it} late onDone={() => complete.mutate(it)} doing={complete.isPending} />
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {days.map((d) => {
              const k = dayKey(d);
              const list = byDay.get(k) ?? [];
              const isToday = k === todayKey;
              return (
                <Card
                  key={k}
                  className={`p-3 min-h-[180px] space-y-2 ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {DAY_LABELS[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                    </span>
                    {list.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {list.length}
                      </Badge>
                    )}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Sem follow-ups</p>
                  ) : (
                    list.map((it) => (
                      <AgendaItem
                        key={it.key}
                        item={it}
                        compact
                        onDone={() => complete.mutate(it)}
                        doing={complete.isPending}
                      />
                    ))
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

type Item = NonNullable<Awaited<ReturnType<typeof getFupAgenda>>>["scheduled"][number];

function AgendaItem({
  item,
  compact,
  late,
  onDone,
  doing,
}: {
  item: Item;
  compact?: boolean;
  late?: boolean;
  onDone?: () => void;
  doing?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-2 space-y-1 ${
        item.done
          ? "border-emerald-500/40 bg-emerald-500/5 opacity-80"
          : late
            ? "border-destructive/40 bg-destructive/5"
            : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{hhmm(item.dueAt)}</span>
        <div className="flex items-center gap-1">
          {item.done && (
            <Badge className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/40" variant="outline">
              <Check className="h-3 w-3" /> Feito
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            {item.kind === "auto" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {item.kind === "auto" ? "IA" : "Manual"}
          </Badge>
        </div>
      </div>
      <Link
        to="/lead/$id"
        params={{ id: item.leadId }}
        className={`block text-sm font-medium hover:underline truncate ${item.done ? "line-through text-muted-foreground" : ""}`}
      >
        {item.leadName}
      </Link>
      {item.company && <p className="text-[11px] text-muted-foreground truncate">{item.company}</p>}
      <p className="text-[11px] text-muted-foreground truncate">{item.title}</p>
      {item.subtitle && <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>}
      {!compact && (
        <p className="text-[11px] text-muted-foreground truncate">
          {item.assignedName}
          {item.stageName ? ` • ${item.stageName}` : ""}
          {item.lastTouchChannel ? ` • ${channelLabel(item.lastTouchChannel)}` : ""}
        </p>
      )}
      {item.done && item.doneAt && (
        <p className="text-[11px] text-emerald-600 truncate">
          Concluído {hhmm(item.doneAt)}
          {item.doneByName ? ` • ${item.doneByName}` : ""}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Badge variant="secondary" className="text-[10px]">
          {item.touchCount} touches
        </Badge>
        <Link
          to="/lead/$id"
          params={{ id: item.leadId }}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
        >
          <MessageCircle className="h-3 w-3" /> Atender
        </Link>
        {onDone && (
          <button
            type="button"
            disabled={doing}
            onClick={onDone}
            title={item.done ? "Desmarcar follow-up" : "Marcar follow-up como feito"}
            className={`ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] disabled:opacity-50 ${
              item.done
                ? "border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            }`}
          >
            <Check className="h-3 w-3" /> {item.done ? "Desfazer" : "Feito"}
          </button>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}
