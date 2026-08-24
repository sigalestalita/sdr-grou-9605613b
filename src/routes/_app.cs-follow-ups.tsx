import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { getCsFollowUpAgenda, type CsFollowUpItem } from "@/lib/cs-follow-ups.functions";
import { CsFollowUpActionModal } from "@/components/cs/cs-followup-action-modal";
import { CS_SIGNAL_CLASS, CS_SIGNAL_LABEL, CS_STAGE_LABEL, healthLabel } from "@/lib/cs-types";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  HeartPulse,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_app/cs-follow-ups")({
  component: CsFollowUpsPage,
  head: () => ({
    meta: [
      { title: "Follow-ups CS | Lidi CRM" },
      {
        name: "description",
        content:
          "Calendário semanal de follow-ups de cada CS e executivo, com alertas dos checkpoints de onboarding, ativação e renovação.",
      },
      { property: "og:title", content: "Follow-ups CS | Lidi CRM" },
      {
        property: "og:description",
        content: "Cronograma de próximos passos, alertas e checkpoints da jornada do cliente.",
      },
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

const KIND_META: Record<CsFollowUpItem["kind"], { label: string; icon: typeof Bell }> = {
  reuniao: { label: "Próximo passo", icon: Flag },
  alerta: { label: "Alerta", icon: Bell },
  jornada: { label: "Jornada", icon: HeartPulse },
  sem_contato: { label: "Relacionamento", icon: Users },
};

function CsFollowUpsPage() {
  const { user } = useAuth();
  const agendaFn = useServerFn(getCsFollowUpAgenda);
  const qc = useQueryClient();
  const [action, setAction] = useState<{
    item: CsFollowUpItem;
    mode: "resultado" | "reagendar";
  } | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [owner, setOwner] = useState("me");

  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["cs-follow-ups", from, user?.id],
    queryFn: () => agendaFn({ data: { from, to } }),
    enabled: !!user,
  });

  const ownerId = owner === "all" ? null : owner === "me" ? (data?.currentUserId ?? null) : owner;
  const filter = (rows: CsFollowUpItem[]) =>
    ownerId ? rows.filter((r) => r.ownerId === ownerId) : rows;

  const overdue = filter(data?.overdue ?? []);
  const scheduled = filter(data?.scheduled ?? []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cs-follow-ups"] });
    qc.invalidateQueries({ queryKey: ["cs-board"] });
  };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, CsFollowUpItem[]>();
    for (const it of scheduled) {
      const k = dayKey(it.dueAt);
      map.set(k, [...(map.get(k) ?? []), it]);
    }
    return map;
  }, [scheduled]);

  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDays className="h-5 w-5" /> Follow-ups de CS
          </h1>
          <p className="text-sm text-muted-foreground">
            Agenda de cada CS e executivo: próximos passos das reuniões, tratativas de alertas e
            checkpoints de onboarding, ativação e renovação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="me">Minha agenda</option>
            <option value="all">Todo o time</option>
            {(data?.owners ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
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
            <Kpi label="Concluídos na semana" value={String(scheduled.filter((i) => i.done).length)} />
          </div>

          {overdue.length > 0 && (
            <Card className="border-destructive/40 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Atrasados ({overdue.length})
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {overdue.slice(0, 60).map((it) => (
                  <FollowUpItem
                    key={it.key}
                    item={it}
                    late
                    onAction={(mode) => setAction({ item: it, mode })}
                  />
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
                  className={`min-h-[180px] space-y-2 p-3 ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
                    >
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
                      <FollowUpItem
                        key={it.key}
                        item={it}
                        compact
                        onAction={(mode) => setAction({ item: it, mode })}
                      />
                    ))
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {action && (
        <CsFollowUpActionModal
          item={action.item}
          mode={action.mode}
          onClose={() => setAction(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function FollowUpItem({
  item,
  compact,
  late,
  onAction,
}: {
  item: CsFollowUpItem;
  compact?: boolean;
  late?: boolean;
  onAction?: (mode: "resultado" | "reagendar") => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const health = healthLabel(item.healthScore);
  return (
    <div
      className={`space-y-1 rounded-lg border p-2 ${
        item.done
          ? "border-emerald-500/40 bg-emerald-500/5 opacity-80"
          : late
            ? "border-destructive/40 bg-destructive/5"
            : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{hhmm(item.dueAt)}</span>
        <div className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${CS_SIGNAL_CLASS[item.signal]}`} title={CS_SIGNAL_LABEL[item.signal]} />
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Icon className="h-3 w-3" /> {meta.label}
          </Badge>
        </div>
      </div>
      <p className={`truncate text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>
        {item.clientName}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        <span className="font-mono">{item.clientUid}</span> · {item.ownerName}
      </p>
      <p className="truncate text-[11px]">{item.title}</p>
      {item.subtitle && <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>}
      {!compact && (
        <p className="truncate text-[11px] text-muted-foreground">
          {CS_STAGE_LABEL[item.stage as keyof typeof CS_STAGE_LABEL] ?? item.stage} ·{" "}
          <span className={health.cls}>Health {item.healthScore}</span>
        </p>
      )}
      {onAction && !item.done && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => onAction("resultado")}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-600 hover:bg-emerald-500/20"
          >
            <Check className="h-3 w-3" /> Resultado
          </button>
          <button
            type="button"
            onClick={() => onAction("reagendar")}
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            <CalendarClock className="h-3 w-3" /> Reagendar
          </button>
        </div>
      )}
      {item.done && (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-600"
        >
          <Check className="h-3 w-3" /> Concluído
        </Badge>
      )}
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
