import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getCsCadence, type CsCadenceRow } from "@/lib/cs-cadence.functions";
import { listCadenceTasks, upsertCadenceTask } from "@/lib/cs-cadence-kanban.functions";
import { CADENCE_URGENCY_LABEL, URGENCY_TONE, WEEKDAY_LABEL } from "@/lib/cs/cadence";
import { CS_SIGNAL_LABEL, CS_STAGE_LABEL, mondayOf, type CsSignal } from "@/lib/cs-types";
import { useAuth } from "@/lib/use-auth";
import { useCurrentRole } from "@/lib/use-role";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_app/cs-kanban")({
  component: CsKanbanPage,
  head: () => ({
    meta: [
      { title: "Kanban de Cadência CS | Grou Compass" },
      {
        name: "description",
        content:
          "Kanban semanal por analista de CS: o que fazer com cada cliente em cada dia, com check de conclusão por ação.",
      },
      { property: "og:title", content: "Kanban de Cadência CS | Grou Compass" },
      {
        property: "og:description",
        content:
          "Organize a cadência da carteira de CS por dia da semana e marque cada ação como concluída.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SIGNAL_DOT: Record<string, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-500",
  preto: "bg-zinc-700",
  sem_dado: "bg-muted-foreground/30",
};

function shiftWeek(weekStart: string, delta: number) {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

function dayLabel(weekStart: string, weekday: number) {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (weekday - 1));
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

type TaskCard = {
  row: CsCadenceRow;
  weekday: number;
  done: boolean;
};

function CadenceKanbanCard({
  card,
  weekStart,
  onOpen,
  onToggle,
  onMove,
  busy,
}: {
  card: TaskCard;
  weekStart: string;
  onOpen: () => void;
  onToggle: (done: boolean) => void;
  onMove: (weekday: number) => void;
  busy: boolean;
}) {
  const { row, done } = card;
  const p = row.plan;
  return (
    <Card className={`p-3 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={done}
          disabled={busy}
          onCheckedChange={(v) => onToggle(Boolean(v))}
          aria-label={`Marcar ação de ${row.clientName} como concluída`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <button
            onClick={onOpen}
            className={`block truncate text-left text-sm font-semibold hover:underline ${done ? "line-through" : ""}`}
          >
            {row.clientName}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${SIGNAL_DOT[p.color] ?? SIGNAL_DOT.sem_dado}`}
            />
            <span>{CS_SIGNAL_LABEL[p.color] ?? p.color}</span>
            <span>· {CS_STAGE_LABEL[row.stage as keyof typeof CS_STAGE_LABEL] ?? row.stage}</span>
            <span>· {row.ownerName}</span>
          </div>
          <p className="mt-2 text-xs">{p.action}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={URGENCY_TONE[p.urgency]}>
              {CADENCE_URGENCY_LABEL[p.urgency]}
            </Badge>
            {p.overdueDays > 0 ? (
              <Badge variant="outline" className="border-red-500/50 text-red-500">
                Atrasado {p.overdueDays}d
              </Badge>
            ) : null}
            {p.escalate ? <Badge variant="outline">Escalar: {p.escalate}</Badge> : null}
            {row.masterclass ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
                title={`${row.masterclass.moduleName} — ${row.masterclass.motivo}`}
              >
                MC módulo {row.masterclass.moduleId}
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                disabled={busy || d === card.weekday}
                onClick={() => onMove(d)}
                className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                  d === card.weekday
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {WEEKDAY_LABEL[d]?.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CsKanbanPage() {
  const { user } = useAuth();
  const role = useCurrentRole();
  const qc = useQueryClient();
  const fetchCadence = useServerFn(getCsCadence);
  const fetchTasks = useServerFn(listCadenceTasks);
  const saveTask = useServerFn(upsertCadenceTask);

  const [weekStart, setWeekStart] = useState<string>(() => mondayOf());
  const [tipo, setTipo] = useState<"empresa" | "consultoria" | "all">("all");
  const [ownerId, setOwnerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const navigate = useNavigate();
  const setOpenUid = (uid: string | null) => {
    if (uid) navigate({ to: "/empresas/$uid", params: { uid } });
  };

  const cadenceQ = useQuery({
    queryKey: ["cs-cadence", tipo],
    queryFn: () => fetchCadence({ data: { tipo, weeks: 12 } }),
  });
  const tasksQ = useQuery({
    queryKey: ["cs-cadence-tasks", weekStart],
    queryFn: () => fetchTasks({ data: { weekStart } }),
  });

  const mutation = useMutation({
    mutationFn: (input: {
      clientUid: string;
      weekStart: string;
      weekday?: number;
      ownerId?: string | null;
      title?: string;
      urgency?: string;
      color?: string;
      done?: boolean;
      notes?: string | null;
    }) => saveTask({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-cadence-tasks", weekStart] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const myOwnerId = user?.id ?? "";
  // "todos" só para a gestão: mostra a carteira do time inteiro num quadro só.
  const verTodos = ownerId === "todos";
  const effectiveOwner = verTodos ? "" : ownerId || myOwnerId;

  const cards = useMemo(() => {
    const tasks = new Map((tasksQ.data ?? []).map((t) => [t.clientUid, t]));
    const q = search.trim().toLowerCase();
    const out: TaskCard[] = [];
    for (const row of cadenceQ.data?.rows ?? []) {
      const task = tasks.get(row.clientUid);
      if (!row.plan.due && !task) continue;
      if (!verTodos && effectiveOwner && row.ownerId !== effectiveOwner) continue;
      if (
        q &&
        !row.clientName.toLowerCase().includes(q) &&
        !row.clientUid.toLowerCase().includes(q)
      )
        continue;
      const done = task?.done ?? false;
      if (hideDone && done) continue;
      out.push({ row, weekday: task?.weekday ?? row.plan.suggestedWeekday, done });
    }
    return out;
  }, [cadenceQ.data, tasksQ.data, effectiveOwner, verTodos, search, hideDone]);

  const byDay = useMemo(() => {
    const map: Record<number, TaskCard[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const c of cards) (map[c.weekday] ?? map[5]).push(c);
    for (const d of [1, 2, 3, 4, 5]) map[d]?.sort((a, b) => Number(a.done) - Number(b.done));
    return map;
  }, [cards]);

  const doneCount = cards.filter((c) => c.done).length;
  const owners = cadenceQ.data?.owners ?? [];
  const ownerName = verTodos
    ? "Todos os analistas"
    : (owners.find((o) => o.id === effectiveOwner)?.name ?? "Minha carteira");

  function toggle(card: TaskCard, done: boolean) {
    mutation.mutate({
      clientUid: card.row.clientUid,
      weekStart,
      weekday: card.weekday,
      ownerId: card.row.ownerId,
      title: card.row.plan.action,
      urgency: card.row.plan.urgency,
      color: card.row.plan.color,
      done,
    });
  }

  function move(card: TaskCard, weekday: number) {
    mutation.mutate({
      clientUid: card.row.clientUid,
      weekStart,
      weekday,
      ownerId: card.row.ownerId,
      title: card.row.plan.action,
      urgency: card.row.plan.urgency,
      color: card.row.plan.color,
    });
  }

  const loading = cadenceQ.isLoading || tasksQ.isLoading;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kanban de Cadência CS</h1>
          <p className="text-sm text-muted-foreground">
            O que fazer com cada cliente em cada dia da semana, segundo a cadência do Playbook — com
            check por ação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="h-9 px-3 text-sm">
            Semana de {dayLabel(weekStart, 1)}
          </Badge>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setWeekStart(mondayOf())}>
            Semana atual
          </Button>
        </div>
      </header>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">Minha carteira</option>
            {role.canAccessAll && <option value="todos">Todos os analistas</option>}
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="all">Todos os funis</option>
            <option value="empresa">Empresas</option>
            <option value="consultoria">Consultorias</option>
          </select>
          <Button variant={hideDone ? "default" : "outline"} onClick={() => setHideDone((v) => !v)}>
            {hideDone ? "Ocultando concluídos" : "Mostrando concluídos"}
          </Button>
          <div className="flex items-center gap-3 rounded-md border border-border px-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {ownerName}
            </span>
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" />
              {cards.length} ações
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {doneCount} feitas
            </span>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Montando o kanban da semana...</Card>
      ) : cards.length === 0 ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
          Nenhuma ação de cadência nesta carteira/semana.
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((d) => (
            <div key={d} className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {WEEKDAY_LABEL[d]}
                  </div>
                  <div className="text-xs text-muted-foreground">{dayLabel(weekStart, d)}</div>
                </div>
                <div className="text-sm font-bold">
                  {(byDay[d] ?? []).filter((c) => c.done).length}/{byDay[d]?.length ?? 0}
                </div>
              </div>
              {(byDay[d] ?? []).map((c) => (
                <CadenceKanbanCard
                  key={c.row.clientUid}
                  card={c}
                  weekStart={weekStart}
                  busy={mutation.isPending}
                  onOpen={() => setOpenUid(c.row.clientUid)}
                  onToggle={(done) => toggle(c, done)}
                  onMove={(wd) => move(c, wd)}
                />
              ))}
              {(byDay[d]?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                  Sem ações
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
