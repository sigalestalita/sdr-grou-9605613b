import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCsAgenda, syncCsCalendly } from "@/lib/cs-integrations.functions";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Video } from "lucide-react";

export const Route = createFileRoute("/_app/cs-agenda")({
  component: CsAgendaPage,
  head: () => ({
    meta: [
      { title: "Agenda CS | Lidi CRM" },
      {
        name: "description",
        content:
          "Agenda semanal do Calendly de todo o time de Customer Success, com reuniões, convidados e links de acesso.",
      },
      { property: "og:title", content: "Agenda CS | Lidi CRM" },
      {
        property: "og:description",
        content: "Visão do gestor sobre as reuniões agendadas de cada pessoa do time de CS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function CsAgendaPage() {
  const agendaFn = useServerFn(listCsAgenda);
  const syncFn = useServerFn(syncCsCalendly);
  const qc = useQueryClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [owner, setOwner] = useState("");

  const { from, to, days } = useMemo(() => {
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    const end = new Date(base);
    end.setDate(end.getDate() + 7);
    const list = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    });
    return { from: base.toISOString(), to: end.toISOString(), days: list };
  }, [weekOffset]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cs-agenda", from, owner],
    queryFn: () => agendaFn({ data: { from, to, userId: owner || undefined } }),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { all: true } }),
    onSuccess: (r) => {
      toast.success(`${r.events} evento(s) sincronizado(s)`);
      qc.invalidateQueries({ queryKey: ["cs-agenda"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const nameOf = useMemo(() => {
    const map = new Map((data?.users ?? []).map((u) => [u.userId, u.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [data?.users]);

  const byDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["events"]>();
    for (const e of data?.events ?? []) {
      const key = new Date(e.start_time).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [data?.events]);

  const total = data?.events.length ?? 0;
  const canceled = (data?.events ?? []).filter((e) => e.status === "canceled").length;

  if (error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro ao carregar a agenda"}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CalendarDays className="h-5 w-5" /> Agenda do time de CS
          </h1>
          <p className="text-sm text-muted-foreground">
            Reuniões do Calendly de cada pessoa vinculada.{" "}
            <Link to="/cs-integracoes" className="text-primary underline">
              Vincular agenda
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.isManager && (
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todo o time</option>
              {(data?.users ?? [])
                .filter((u) => u.calendlyConnected)
                .map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name}
                  </option>
                ))}
            </select>
          )}
          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /> Sincronizar
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {days[0]?.toLocaleDateString("pt-BR")} — {days[6]?.toLocaleDateString("pt-BR")}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>
          Hoje
        </Button>
        <div className="ml-auto flex gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{total} reunião(ões)</Badge>
          {canceled > 0 && <Badge variant="outline">{canceled} cancelada(s)</Badge>}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {days.map((d) => {
            const list = byDay.get(d.toDateString()) ?? [];
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div
                key={d.toISOString()}
                className={`space-y-2 rounded-xl border p-3 ${isToday ? "border-primary/50 bg-primary/5" : "bg-muted/20"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold capitalize">
                    {d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">
                    {list.length}
                  </Badge>
                </div>
                {list.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem reuniões.</p>
                )}
                {list.map((e) => (
                  <Card
                    key={e.id}
                    className={`space-y-1 p-2.5 text-xs ${e.status === "canceled" ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {new Date(e.start_time).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {e.status === "canceled" ? (
                        <Badge variant="outline" className="text-[9px]">
                          cancelada
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">
                          {nameOf(e.user_id)}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium leading-tight">{e.name ?? "Reunião"}</p>
                    {e.invitee_name && (
                      <p className="text-muted-foreground">
                        {e.invitee_name}
                        {e.invitee_email ? ` · ${e.invitee_email}` : ""}
                      </p>
                    )}
                    {e.client_uid && (
                      <Badge variant="outline" className="text-[9px]">
                        {e.client_uid}
                      </Badge>
                    )}
                    {e.meeting_url && (
                      <a
                        href={e.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Video className="h-3 w-3" /> Entrar
                      </a>
                    )}
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
