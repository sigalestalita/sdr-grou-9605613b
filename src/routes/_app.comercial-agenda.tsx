import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Link2,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getComercialAgenda } from "@/lib/comercial-agenda.functions";
import { connectCsGoogleCalendar, syncCsCalendly } from "@/lib/cs-integrations.functions";

export const Route = createFileRoute("/_app/comercial-agenda")({
  component: ComercialAgendaPage,
  head: () => ({ meta: [{ title: "Agenda comercial | Grou Compass" }] }),
});

type ViewMode = "day" | "week" | "month";

const ORIGEM_LABEL: Record<string, string> = {
  google: "Google",
  sdr: "Do SDR",
  negocio: "Negócio",
};

const ORIGEM_TONE: Record<string, string> = {
  sdr: "border-primary/40 bg-primary/10 text-primary",
  negocio: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

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

/**
 * Agenda do executivo comercial, e do time inteiro para a gestão.
 *
 * Junta três fontes na mesma grade: o Google do executivo, as reuniões que o
 * SDR marcou no CRM e as reuniões dos negócios da carteira. As do SDR são a
 * razão de a ligação existir — elas aparecem aqui mesmo antes de o Google
 * sincronizar, e mesmo se a pessoa ainda não ligou a agenda.
 */
function ComercialAgendaPage() {
  const agendaFn = useServerFn(getComercialAgenda);
  const conectarFn = useServerFn(connectCsGoogleCalendar);
  const syncFn = useServerFn(syncCsCalendly);
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("week");
  const [offset, setOffset] = useState(0);
  const [executivo, setExecutivo] = useState("");
  const [icsUrl, setIcsUrl] = useState("");

  const { from, to, days, label } = useMemo(() => {
    const hoje = startOfDay(new Date());
    if (view === "day") {
      const ini = new Date(hoje);
      ini.setDate(ini.getDate() + offset);
      const fim = new Date(ini);
      fim.setDate(fim.getDate() + 1);
      return {
        from: ini.toISOString(),
        to: fim.toISOString(),
        days: [ini],
        label: ini.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
      };
    }
    if (view === "week") {
      const ini = startOfWeek(hoje);
      ini.setDate(ini.getDate() + offset * 7);
      const lista = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ini);
        d.setDate(d.getDate() + i);
        return d;
      });
      const fim = new Date(ini);
      fim.setDate(fim.getDate() + 7);
      return {
        from: ini.toISOString(),
        to: fim.toISOString(),
        days: lista,
        label: `${ini.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${lista[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`,
      };
    }
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    const grade = startOfWeek(ini);
    const lista = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(grade);
      d.setDate(d.getDate() + i);
      return d;
    });
    const fim = new Date(lista[41]);
    fim.setDate(fim.getDate() + 1);
    return {
      from: grade.toISOString(),
      to: fim.toISOString(),
      days: lista,
      label: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [view, offset]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["comercial-agenda", from, to, executivo],
    queryFn: () => agendaFn({ data: { from, to, executivoId: executivo || undefined } }),
  });

  const nomeDe = useMemo(() => {
    const m = new Map((data?.executivos ?? []).map((e) => [e.userId, e.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [data?.executivos]);

  const porDia = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>["eventos"]>();
    for (const e of data?.eventos ?? []) {
      const k = new Date(e.inicio).toDateString();
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [data?.eventos]);

  const porExecutivo = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data?.eventos ?? []) {
      if (e.cancelado) continue;
      m.set(e.executivoId, (m.get(e.executivoId) ?? 0) + 1);
    }
    return [...m].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
  }, [data?.eventos]);

  const conectar = useMutation({
    mutationFn: () => conectarFn({ data: { icsUrl: icsUrl.trim() } }),
    onSuccess: () => {
      toast.success("Agenda vinculada");
      setIcsUrl("");
      qc.invalidateQueries({ queryKey: ["comercial-agenda"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const sincronizar = useMutation({
    mutationFn: () => syncFn({ data: { all: !!data?.isManager } }),
    onSuccess: (r) => {
      toast.success(`${r.events} evento(s) sincronizado(s)`);
      qc.invalidateQueries({ queryKey: ["comercial-agenda"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro ao carregar a agenda"}
      </div>
    );
  }

  const total = data?.eventos.length ?? 0;
  const doSdr = (data?.eventos ?? []).filter((e) => e.origem === "sdr").length;
  const mesRef = new Date(from).getMonth();
  const semAgenda = (data?.executivos ?? []).filter((e) => !e.conectado);
  const precisoConectar = !data?.minhaIntegracao?.gcalConnected && data?.souExecutivo;
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
            <CalendarDays className="h-5 w-5" /> Agenda comercial
          </h1>
          <p className="text-sm text-muted-foreground">
            {data?.isManager
              ? "Reuniões de todos os executivos, incluindo as que o SDR agendou."
              : "Suas reuniões, incluindo as que o SDR agendou para você."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.isManager && (
            <select
              value={executivo}
              onChange={(e) => setExecutivo(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todos os executivos</option>
              {(data?.executivos ?? []).map((e) => (
                <option key={e.userId} value={e.userId}>
                  {e.name}
                  {e.conectado ? "" : " (sem agenda)"}
                </option>
              ))}
            </select>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={sincronizar.isPending}
            onClick={() => sincronizar.mutate()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${sincronizar.isPending ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </div>
      </div>

      {/* Sem a agenda ligada, o convite do SDR chega por e-mail mas o sistema
          não consegue conferir se o horário está livre. */}
      {precisoConectar && (
        <Card className="space-y-2 border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-medium">
            <Link2 className="h-4 w-4" /> Vincule sua Google Agenda
          </p>
          <p className="text-[12px] text-muted-foreground">
            Google Agenda → Configurações → a sua agenda → Integrar agenda → “endereço secreto em
            formato iCal”. É só leitura: o sistema passa a mostrar seus compromissos aqui e o SDR
            passa a ver seus horários livres antes de marcar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              className="h-8 min-w-[280px] flex-1 text-xs"
            />
            <Button
              size="sm"
              disabled={icsUrl.trim().length < 20 || conectar.isPending}
              onClick={() => conectar.mutate()}
            >
              {conectar.isPending ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        </Card>
      )}

      {data?.isManager && semAgenda.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Sem agenda vinculada: {semAgenda.map((e) => e.name).join(", ")}. Enquanto não vincularem,
          o SDR marca sem enxergar os horários ocupados —{" "}
          <Link to="/cs-integracoes" className="text-primary underline">
            vincular por eles
          </Link>
          .
        </p>
      )}

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
          {doSdr > 0 && <Badge variant="outline">{doSdr} do SDR</Badge>}
          {data?.isManager &&
            porExecutivo.map((o) => (
              <Badge key={o.id} variant="outline">
                {nomeDe(o.id)}: {o.n}
              </Badge>
            ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : (
        <div className={`grid gap-3 ${gridCols}`}>
          {days.map((d) => {
            const lista = porDia.get(d.toDateString()) ?? [];
            const hoje = d.toDateString() === new Date().toDateString();
            const foraDoMes = view === "month" && d.getMonth() !== mesRef;
            return (
              <div
                key={d.toISOString()}
                className={`space-y-2 rounded-xl border p-3 ${
                  hoje ? "border-primary/50 bg-primary/5" : "bg-muted/20"
                } ${foraDoMes ? "opacity-40" : ""} ${view === "month" ? "min-h-[120px]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold capitalize">
                    {d.toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">
                    {lista.length}
                  </Badge>
                </div>
                {lista.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem reuniões.</p>
                )}
                {lista.map((e) => (
                  <Card
                    key={e.id}
                    className={`space-y-1 p-2.5 text-xs ${e.cancelado ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {new Date(e.inicio).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${ORIGEM_TONE[e.origem] ?? ""}`}
                      >
                        {e.cancelado ? "cancelada" : ORIGEM_LABEL[e.origem]}
                      </Badge>
                    </div>
                    <p className="font-medium leading-tight">{e.titulo}</p>
                    {e.convidado && <p className="text-muted-foreground">{e.convidado}</p>}
                    {data?.isManager && (
                      <p className="text-[10px] text-muted-foreground">{nomeDe(e.executivoId)}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {e.meetUrl && (
                        <a
                          href={e.meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Video className="h-3 w-3" /> Entrar
                        </a>
                      )}
                      {e.leadId && (
                        <Link
                          to="/lead/$id"
                          params={{ id: e.leadId }}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Sparkles className="h-3 w-3" /> Ver lead
                        </Link>
                      )}
                      {e.dealId && (
                        <Link
                          to="/negocio/$id"
                          params={{ id: e.dealId }}
                          className="text-primary hover:underline"
                        >
                          Ver negócio
                        </Link>
                      )}
                    </div>
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
