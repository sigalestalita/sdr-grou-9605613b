import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/use-auth";
import { getCsHome } from "@/lib/cs.functions";
import { getCsFollowUpAgenda, type CsFollowUpItem } from "@/lib/cs-follow-ups.functions";
import { followUpNeedsEvidence } from "@/lib/cs-follow-up-types";
import { AwaitingEvidencePill } from "@/components/cs/cs-task-dialog";
import { getCsCadence, type CsCadenceRow } from "@/lib/cs-cadence.functions";
import { CsFollowUpActionModal } from "@/components/cs/cs-followup-action-modal";
import { CS_SIGNAL_CLASS } from "@/lib/cs-types";
import { CADENCE_URGENCY_LABEL } from "@/lib/cs/cadence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Rss,
} from "lucide-react";

export const Route = createFileRoute("/_app/inicio")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Início | Grou Compass" },
      {
        name: "description",
        content: "Seu dia: tarefas, contatos da cadência, alertas e atividade recente da carteira.",
      },
    ],
  }),
});

const URGENCY_RANK: Record<string, number> = {
  crise: 0,
  estrategico: 1,
  urgente: 2,
  normal: 3,
  baixa: 4,
  nenhuma: 5,
};

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Página inicial no padrão HubSpot: saudação, o que tenho hoje (tarefas e
 * contatos da cadência), alertas da minha carteira e feed de atividades.
 */
function HomePage() {
  const { user } = useAuth();
  const homeFn = useServerFn(getCsHome);
  const agendaFn = useServerFn(getCsFollowUpAgenda);
  const cadenceFn = useServerFn(getCsCadence);
  const qc = useQueryClient();
  const [action, setAction] = useState<{
    item: CsFollowUpItem;
    mode: "resultado" | "reagendar";
  } | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => new Date(today.getTime() + 86400000), [today]);

  const home = useQuery({
    queryKey: ["cs-home", user?.id],
    queryFn: () => homeFn({}),
    enabled: !!user,
  });
  const agenda = useQuery({
    queryKey: ["cs-follow-ups", "hoje", user?.id],
    queryFn: () => agendaFn({ data: { from: today.toISOString(), to: tomorrow.toISOString() } }),
    enabled: !!user,
  });
  const cadence = useQuery({
    queryKey: ["cs-cadence", "home", user?.id],
    queryFn: () => cadenceFn({ data: { tipo: "all" } }),
    enabled: !!user,
  });

  const me = user?.id ?? null;
  const tasks = useMemo(() => {
    const all = [...(agenda.data?.overdue ?? []), ...(agenda.data?.scheduled ?? [])];
    return all
      .filter((t) => !t.done && (!me || t.ownerId === me))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }, [agenda.data, me]);

  const dueRows = useMemo(() => {
    const rows = (cadence.data?.rows ?? []).filter(
      (r: CsCadenceRow) => r.plan.due && (!me || r.ownerId === me || r.execId === me),
    );
    return rows
      .sort((a, b) => (URGENCY_RANK[a.plan.urgency] ?? 9) - (URGENCY_RANK[b.plan.urgency] ?? 9))
      .slice(0, 8);
  }, [cadence.data, me]);

  const myAlerts = (home.data?.alerts ?? []).filter((a) => a.mine).slice(0, 6);
  const events = home.data?.events ?? [];
  const profileName = useMemo(() => {
    const map = new Map(
      (home.data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]),
    );
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "—") : "Sistema");
  }, [home.data?.profiles]);

  const firstName = (home.data?.me.name ?? "").split(" ")[0] || "";
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["cs-home"] });
    qc.invalidateQueries({ queryKey: ["cs-follow-ups"] });
    qc.invalidateQueries({ queryKey: ["cs-cadence"] });
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-4 lg:p-8">
      <header>
        <p className="text-[12px] font-medium capitalize text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {greeting(new Date())}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      {/* Resumo da carteira */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Minha carteira"
          value={home.data?.carteira.mine ?? 0}
          hint={`de ${home.data?.carteira.total ?? 0} empresas`}
          to="/cs"
        />
        <Tile
          label="Em vermelho"
          value={home.data?.carteira.mineRed ?? 0}
          tone={home.data?.carteira.mineRed ? "red" : undefined}
          to="/cs"
        />
        <Tile
          label="Alertas abertos"
          value={home.data?.carteira.alertsMine ?? 0}
          hint={`${home.data?.carteira.alertsOpen ?? 0} no time`}
          tone={home.data?.carteira.alertsMine ? "amber" : undefined}
          to="/cs"
        />
        <Tile label="Tarefas hoje" value={tasks.length + dueRows.length} to="/cs-follow-ups" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {/* Tarefas */}
          <Section icon={CalendarCheck} title="Tarefas" to="/cs-follow-ups" toLabel="Ver agenda">
            {agenda.isLoading ? (
              <Empty>Carregando…</Empty>
            ) : tasks.length === 0 ? (
              <Empty>Hoje você não tem tarefas.</Empty>
            ) : (
              <ul className="divide-y">
                {tasks.map((t) => {
                  const overdue = new Date(t.dueAt) < today;
                  return (
                    <li key={t.key} className="flex items-center gap-3 py-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${CS_SIGNAL_CLASS[t.signal ?? "sem_dado"]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{t.title}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          <Link
                            to="/empresas/$uid"
                            params={{ uid: t.clientUid }}
                            className="hover:underline"
                          >
                            {t.clientName}
                          </Link>
                          {t.subtitle ? ` · ${t.subtitle}` : ""}
                        </p>
                      </div>
                      <span
                        className={`whitespace-nowrap text-[11px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {overdue ? "atrasada · " : ""}
                        {format(new Date(t.dueAt), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                      {followUpNeedsEvidence(t, agenda.data?.evidenceChannels ?? []) ? (
                        <AwaitingEvidencePill type={t.taskType ?? "email"} />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          onClick={() => setAction({ item: t, mode: "resultado" })}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Cadência */}
          <Section
            icon={Activity}
            title="Contatos da cadência"
            to="/cs-kanban"
            toLabel="Ver kanban semanal"
          >
            {cadence.isLoading ? (
              <Empty>Carregando…</Empty>
            ) : dueRows.length === 0 ? (
              <Empty>Nenhum contato vencido na sua carteira.</Empty>
            ) : (
              <ul className="divide-y">
                {dueRows.map((r) => (
                  <li key={r.clientUid} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${CS_SIGNAL_CLASS[r.plan.color ?? "sem_dado"]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        <Link
                          to="/empresas/$uid"
                          params={{ uid: r.clientUid }}
                          className="hover:underline"
                        >
                          {r.clientName}
                        </Link>
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {r.plan.action || r.plan.reason}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {CADENCE_URGENCY_LABEL[r.plan.urgency] ?? r.plan.urgency}
                    </Badge>
                    {r.plan.overdueDays > 0 && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-destructive">
                        <Clock className="h-3 w-3" /> {r.plan.overdueDays} d
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          {/* Alertas */}
          <Section icon={Bell} title="Alertas da minha carteira" to="/cs" toLabel="Ver carteira">
            {home.isLoading ? (
              <Empty>Carregando…</Empty>
            ) : myAlerts.length === 0 ? (
              <Empty>Nenhum alerta aberto.</Empty>
            ) : (
              <ul className="space-y-2">
                {myAlerts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[12px]"
                  >
                    <p className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      <Link
                        to="/empresas/$uid"
                        params={{ uid: a.client_uid }}
                        className="truncate hover:underline"
                      >
                        {a.clientName}
                      </Link>
                    </p>
                    <p className="line-clamp-2 text-muted-foreground">{a.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Feed */}
          <Section icon={Rss} title="Feed de atividades">
            {home.isLoading ? (
              <Empty>Carregando…</Empty>
            ) : events.length === 0 ? (
              <Empty>Acompanhe aqui os contatos, agendas e alterações da carteira.</Empty>
            ) : (
              <ol className="relative space-y-3 border-l pl-4">
                {events.slice(0, 15).map((e) => (
                  <li key={e.id} className="text-[12px]">
                    <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="font-medium text-foreground">
                      <Link
                        to="/empresas/$uid"
                        params={{ uid: e.client_uid }}
                        className="hover:underline"
                      >
                        {e.clientName}
                      </Link>
                      <span className="font-normal text-muted-foreground"> · {e.title}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {[
                        e.channel,
                        profileName(e.author_id),
                        format(new Date(e.occurred_at), "dd/MM HH:mm", { locale: ptBR }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>

      {action && (
        <CsFollowUpActionModal
          item={action.item}
          mode={action.mode}
          evidenceChannels={agenda.data?.evidenceChannels ?? []}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            invalidateAll();
          }}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
  to,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "red" | "amber";
  to: string;
}) {
  const ring = tone === "red" ? "border-red-500/40" : tone === "amber" ? "border-warning/50" : "";
  return (
    <Link
      to={to}
      className={`surface-panel block p-3 transition-colors hover:border-primary/50 ${ring}`}
    >
      <p className="section-label">{label}</p>
      <p className="metric-value mt-1 text-2xl">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </Link>
  );
}

function Section({
  icon: Icon,
  title,
  to,
  toLabel,
  children,
}: {
  icon: typeof Building2;
  title: string;
  to?: string;
  toLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {to && (
          <Link
            to={to}
            className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
          >
            {toLabel ?? "Ver tudo"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-[13px] text-muted-foreground">{children}</p>;
}
