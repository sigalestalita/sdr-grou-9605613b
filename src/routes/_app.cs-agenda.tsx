import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCsAgenda, syncCsCalendly } from "@/lib/cs-integrations.functions";
import {
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Link2,
  Plus,
  RefreshCw,
  Video,
} from "lucide-react";
import { AgendarReuniaoDialog, VincularEventoDialog } from "@/components/cs/agendar-reuniao";

/** Item da agenda: evento da Google Agenda ou reunião marcada no Compass. */
type ItemAgenda = {
  id: string;
  origem: "google" | "compass";
  inicio: string;
  titulo: string;
  userId: string | null;
  cancelado: boolean;
  status: string | null;
  convidado: string | null;
  clientUid: string | null;
  clienteNome: string | null;
  contactId: string | null;
  contatoNome: string | null;
  meetingUrl: string | null;
};

export const Route = createFileRoute("/_app/cs-agenda")({
  component: CsAgendaPage,
  head: () => ({
    meta: [
      { title: "Agenda CS | Grou Compass" },
      {
        name: "description",
        content:
          "Agenda do time de Customer Success por dia, semana e mês, com reuniões, convidados e links de acesso.",
      },
      { property: "og:title", content: "Agenda CS | Grou Compass" },
      {
        property: "og:description",
        content: "Visão do gestor sobre as reuniões agendadas de cada pessoa do time de CS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ViewMode = "day" | "week" | "month";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function CsAgendaPage() {
  const agendaFn = useServerFn(listCsAgenda);
  const syncFn = useServerFn(syncCsCalendly);
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("week");
  const [offset, setOffset] = useState(0);
  const [owner, setOwner] = useState("");
  const [agendarNoDia, setAgendarNoDia] = useState<Date | null>(null);
  const [vinculando, setVinculando] = useState<ItemAgenda | null>(null);

  const { from, to, days, label } = useMemo(() => {
    const today = startOfDay(new Date());
    if (view === "day") {
      const start = new Date(today);
      start.setDate(start.getDate() + offset);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        days: [start],
        label: start.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        }),
      };
    }
    if (view === "week") {
      const start = startOfWeek(today);
      start.setDate(start.getDate() + offset * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const list = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      });
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        days: list,
        label: `${start.toLocaleDateString("pt-BR")} — ${list[6]!.toLocaleDateString("pt-BR")}`,
      };
    }
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const gridStart = startOfWeek(start);
    const total = Math.ceil((end.getTime() - gridStart.getTime()) / (24 * 3600 * 1000) / 7) * 7;
    const list = Array.from({ length: total }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      days: list,
      label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [view, offset]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cs-agenda", from, to, owner],
    queryFn: () => agendaFn({ data: { from, to, userId: owner || undefined } }),
  });

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of data?.users ?? []) map.set(u.userId, u.name);
    for (const o of data?.owners ?? []) map.set(o.userId, o.name);
    return (id: string) => map.get(id) ?? "—";
  }, [data?.users, data?.owners]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of data?.owners ?? []) map.set(o.userId, o.name);
    for (const u of data?.users ?? []) if (u.calendlyConnected) map.set(u.userId, u.name);
    return Array.from(map, ([userId, name]) => ({ userId, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [data?.owners, data?.users]);

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { all: true } }),
    onSuccess: (r) => {
      toast.success(`${r.events} evento(s) sincronizado(s)`);
      qc.invalidateQueries({ queryKey: ["cs-agenda"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const itens = useMemo<ItemAgenda[]>(() => {
    type Ev = {
      id: string;
      start_time: string;
      name: string | null;
      user_id: string;
      status: string | null;
      invitee_name: string | null;
      invitee_email: string | null;
      client_uid: string | null;
      contact_id?: string | null;
      meeting_url: string | null;
      cs_clients?: { nome_empresa: string | null } | null;
      cs_contacts?: { nome: string | null } | null;
    };
    const google = ((data?.events ?? []) as unknown as Ev[]).map((e) => ({
      id: e.id,
      origem: "google" as const,
      inicio: e.start_time,
      titulo: e.name ?? "Reunião",
      userId: e.user_id,
      cancelado: e.status === "canceled",
      status: e.status,
      convidado: e.invitee_name
        ? `${e.invitee_name}${e.invitee_email ? ` · ${e.invitee_email}` : ""}`
        : (e.invitee_email ?? null),
      clientUid: e.client_uid,
      clienteNome: e.cs_clients?.nome_empresa ?? null,
      contactId: e.contact_id ?? null,
      contatoNome: e.cs_contacts?.nome ?? null,
      meetingUrl: e.meeting_url,
    }));
    const compass = (data?.reunioes ?? []).map((r) => ({
      id: r.id,
      origem: "compass" as const,
      inicio: r.inicio,
      titulo: r.titulo,
      userId: r.ownerId,
      cancelado: r.status === "cancelada",
      status: r.status,
      convidado: null,
      clientUid: r.clientUid,
      clienteNome: r.clienteNome,
      contactId: null,
      contatoNome: r.contatoNome,
      meetingUrl: r.meetingUrl,
    }));
    return [...google, ...compass].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [data?.events, data?.reunioes]);

  const byDay = useMemo(() => {
    const map = new Map<string, ItemAgenda[]>();
    for (const e of itens) {
      const key = new Date(e.inicio).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [itens]);

  const perOwner = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of itens) {
      if (e.cancelado || !e.userId) continue;
      map.set(e.userId, (map.get(e.userId) ?? 0) + 1);
    }
    return Array.from(map, ([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
  }, [itens]);

  const total = itens.length;
  const canceled = itens.filter((e) => e.cancelado).length;
  const monthRef = useMemo(() => new Date(from).getMonth(), [from]);

  if (error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro ao carregar a agenda"}
      </div>
    );
  }

  const gridCols =
    view === "day"
      ? "grid-cols-1"
      : view === "week"
        ? "md:grid-cols-2 xl:grid-cols-4"
        : "grid-cols-7";

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CalendarDays className="h-5 w-5" /> Agenda do time de CS
          </h1>
          <p className="text-sm text-muted-foreground">
            Reuniões de cada pessoa do time.{" "}
            <Link to="/cs-integracoes" className="text-primary underline">
              Vincular agenda
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todo o time</option>
            {ownerOptions.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setAgendarNoDia(new Date())}>
            <CalendarPlus className="mr-1 h-4 w-4" /> Agendar reunião
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />{" "}
            Sincronizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {(
            [
              ["day", "Hoje"],
              ["week", "Semana"],
              ["month", "Mês"],
            ] as [ViewMode, string][]
          ).map(([v, l]) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "secondary" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => {
                setView(v);
                setOffset(0);
              }}
            >
              {l}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium capitalize">{label}</span>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {offset !== 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
            Voltar para hoje
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{total} reunião(ões)</Badge>
          {canceled > 0 && <Badge variant="outline">{canceled} cancelada(s)</Badge>}
          {perOwner.map((o) => (
            <Badge key={o.id} variant="outline">
              {nameOf(o.id)}: {o.count}
            </Badge>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : (
        <div className={`grid gap-3 ${gridCols}`}>
          {days.map((d) => {
            const list = byDay.get(d.toDateString()) ?? [];
            const isToday = d.toDateString() === new Date().toDateString();
            const outsideMonth = view === "month" && d.getMonth() !== monthRef;
            return (
              <div
                key={d.toISOString()}
                className={`space-y-2 rounded-xl border p-3 ${
                  isToday ? "border-primary/50 bg-primary/5" : "bg-muted/20"
                } ${outsideMonth ? "opacity-40" : ""} ${view === "month" ? "min-h-[120px]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold capitalize">
                    {d.toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAgendarNoDia(d)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Agendar reunião neste dia"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <Badge variant="secondary" className="text-[10px]">
                      {list.length}
                    </Badge>
                  </div>
                </div>
                {list.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem reuniões.</p>
                )}
                {list.map((e) => (
                  <Card
                    key={`${e.origem}:${e.id}`}
                    className={`space-y-1 p-2.5 text-xs ${e.cancelado ? "opacity-60" : ""} ${
                      e.origem === "compass" ? "border-primary/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {new Date(e.inicio).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {e.cancelado ? (
                        <Badge variant="outline" className="text-[9px]">
                          cancelada
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">
                          {e.userId ? nameOf(e.userId) : "—"}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium leading-tight">{e.titulo}</p>
                    {e.contatoNome ? (
                      <p className="text-muted-foreground">com {e.contatoNome}</p>
                    ) : (
                      e.convidado && <p className="text-muted-foreground">{e.convidado}</p>
                    )}
                    {e.clientUid ? (
                      <Link
                        to="/empresas/$uid"
                        params={{ uid: e.clientUid }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Building2 className="h-3 w-3" /> {e.clienteNome ?? e.clientUid}
                      </Link>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {e.meetingUrl && (
                        <a
                          href={e.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Video className="h-3 w-3" /> Entrar
                        </a>
                      )}
                      {e.origem === "google" && (
                        <button
                          type="button"
                          onClick={() => setVinculando(e)}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <Link2 className="h-3 w-3" />{" "}
                          {e.clientUid ? "Trocar vínculo" : "Vincular a empresa/contato"}
                        </button>
                      )}
                      {e.origem === "compass" && e.status === "agendada" && (
                        <Badge variant="outline" className="text-[9px]">
                          agendada no Compass
                        </Badge>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {agendarNoDia && (
        <AgendarReuniaoDialog dia={agendarNoDia} onClose={() => setAgendarNoDia(null)} />
      )}
      {vinculando && (
        <VincularEventoDialog
          evento={{
            id: vinculando.id,
            titulo: vinculando.titulo,
            clientUid: vinculando.clientUid,
            clienteNome: vinculando.clienteNome,
            contactId: vinculando.contactId,
          }}
          onClose={() => setVinculando(null)}
        />
      )}
    </div>
  );
}
