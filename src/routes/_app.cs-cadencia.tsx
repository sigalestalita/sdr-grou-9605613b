import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCsCadence, type CsCadenceRow } from "@/lib/cs-cadence.functions";
import {
  CADENCE_TREND_LABEL,
  CADENCE_URGENCY_LABEL,
  URGENCY_ORDER,
  URGENCY_TONE,
  WEEKDAY_LABEL,
  type CadenceUrgency,
} from "@/lib/cs/cadence";
import { SignalStrip } from "@/components/cs/signal-strip";
import { CS_SIGNAL_LABEL, CS_STAGE_LABEL, type CsSignal } from "@/lib/cs-types";
import { CsClientModal } from "@/components/cs/cs-client-modal";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Minus,
  ShieldAlert,
  Target,
  Timer,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_app/cs-cadencia")({
  component: CsCadenciaPage,
  head: () => ({
    meta: [
      { title: "Cadência CS | Grou Compass" },
      {
        name: "description",
        content:
          "Motor de cadência do Playbook CS: quem precisa de contato nesta semana, por que, com qual tom e em qual dia útil.",
      },
      { property: "og:title", content: "Cadência CS | Grou Compass" },
      {
        property: "og:description",
        content: "Cadência por cor da sinaleira, semanas na cor e tendência de oscilação do cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TREND_ICON = {
  subindo: ArrowUpRight,
  descendo: ArrowDownRight,
  estavel: Minus,
  oscilando: Activity,
} as const;

const SIGNAL_DOT: Record<string, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-500",
  sem_dado: "bg-muted-foreground/30",
};

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function CadenceCard({ row, onOpen }: { row: CsCadenceRow; onOpen: () => void }) {
  const p = row.plan;
  const TrendIcon = TREND_ICON[p.trend];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onOpen} className="truncate text-left text-sm font-semibold hover:underline">
            {row.clientName}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-flex h-2 w-2 rounded-full ${SIGNAL_DOT[p.color] ?? SIGNAL_DOT.sem_dado}`} />
            <span>
              {CS_SIGNAL_LABEL[p.color] ?? p.color} · {p.weeksInColor}
              {p.weeksInColor === 1 ? "ª semana" : " semanas"}
            </span>
            <span className="inline-flex items-center gap-1">
              <TrendIcon className="h-3 w-3" />
              {CADENCE_TREND_LABEL[p.trend]}
            </span>
            <span>· {CS_STAGE_LABEL[row.stage as keyof typeof CS_STAGE_LABEL] ?? row.stage}</span>
            <span>· {row.ownerName}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={URGENCY_TONE[p.urgency]}>
            {CADENCE_URGENCY_LABEL[p.urgency]}
          </Badge>
          <SignalStrip history={row.history as CsSignal[]} weeks={row.weeks} />
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{p.reason}</p>
      <p className="mt-1 text-sm">{p.action}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {p.inGrace ? (
          <Badge variant="outline">Carência · faltam {p.graceWeeks} semanas</Badge>
        ) : p.intervalDays === null ? (
          <Badge variant="outline">Só observar</Badge>
        ) : (
          <Badge variant="outline">Intervalo {p.intervalDays}d</Badge>
        )}
        {p.due ? (
          <Badge variant="outline" className="border-amber-500/50 text-amber-500">
            {p.overdueDays <= 0 ? "Contato nesta semana" : `Atrasado ${p.overdueDays}d`}
          </Badge>
        ) : null}
        {p.due ? <Badge variant="outline">{WEEKDAY_LABEL[p.suggestedWeekday]}</Badge> : null}
        <span>
          Último contato:{" "}
          {p.daysSinceContact === null ? "nunca registrado" : `há ${p.daysSinceContact}d`}
        </span>
        {p.daysToRenewal !== null ? <span>· Renovação em {p.daysToRenewal}d</span> : null}
        <span>· {p.contactsWithResponse}/4 contatos com resposta</span>
        {p.goalAtRisk ? (
          <Badge variant="outline" className="border-red-500/50 text-red-500">
            Meta anual em risco
          </Badge>
        ) : null}
        {p.escalate === "executivo" ? <Badge variant="outline">Envolver Executivo</Badge> : null}
        {p.escalate === "diretoria" ? (
          <Badge variant="outline" className="border-purple-500/50 text-purple-500">
            Revisão com diretoria
          </Badge>
        ) : null}
        {p.consumoPct !== null ? <span>· Consumo {Math.round(p.consumoPct)}%</span> : null}
      </div>
    </Card>
  );
}

function CsCadenciaPage() {
  const fetchCadence = useServerFn(getCsCadence);
  const [tipo, setTipo] = useState<"empresa" | "consultoria" | "all">("empresa");
  const [ownerId, setOwnerId] = useState<string>("");
  const [urgency, setUrgency] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [search, setSearch] = useState("");
  const [openUid, setOpenUid] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cs-cadence", tipo],
    queryFn: () => fetchCadence({ data: { tipo, weeks: 12 } }),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (ownerId && r.ownerId !== ownerId) return false;
      if (urgency && r.plan.urgency !== urgency) return false;
      if (color && r.plan.color !== color) return false;
      if (onlyDue && !r.plan.due) return false;
      if (q && !r.clientName.toLowerCase().includes(q) && !r.clientUid.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, ownerId, urgency, color, onlyDue, search]);

  const byWeekday = useMemo(() => {
    const map: Record<number, CsCadenceRow[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const r of rows) {
      if (!r.plan.due) continue;
      const d = r.plan.suggestedWeekday;
      (map[d] ?? map[5]).push(r);
    }
    return map;
  }, [rows]);

  const t = data?.totals;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Cadência CS</h1>
          <p className="text-sm text-muted-foreground">
            Playbook Sinaleira GROU v2 — quem precisa de contato agora, por que e em qual dia útil.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["empresa", "consultoria", "all"] as const).map((v) => (
            <Button key={v} size="sm" variant={tipo === v ? "default" : "outline"} onClick={() => setTipo(v)}>
              {v === "empresa" ? "Empresas" : v === "consultoria" ? "Consultorias" : "Todos"}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Clientes na carteira" value={t?.clients ?? 0} icon={Users} />
        <Kpi label="Contatos devidos" value={t?.due ?? 0} hint="Gatilho aberto nesta semana" icon={CalendarClock} />
        <Kpi label="Em carência" value={t?.inGrace ?? 0} hint="Primeiros 60 dias de licença" icon={Timer} />
        <Kpi label="Meta anual em risco" value={t?.goalAtRisk ?? 0} hint="< 4 contatos com resposta" icon={Target} />
        <Kpi
          label="Escaladas"
          value={`${t?.escalateExecutivo ?? 0} / ${t?.escalateDiretoria ?? 0}`}
          hint="Executivo / Diretoria"
          icon={ShieldAlert}
        />
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">Todos os CS</option>
            {(data?.owners ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            <option value="">Toda sinaleira</option>
            {(["vermelho", "amarelo", "verde", "sem_dado"] as const).map((c) => (
              <option key={c} value={c}>
                {CS_SIGNAL_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
          >
            <option value="">Toda urgência</option>
            {URGENCY_ORDER.map((u) => (
              <option key={u} value={u}>
                {CADENCE_URGENCY_LABEL[u as CadenceUrgency]}
              </option>
            ))}
          </select>
          <Button variant={onlyDue ? "default" : "outline"} onClick={() => setOnlyDue((v) => !v)}>
            {onlyDue ? "Só com gatilho aberto" : "Mostrando todos"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Distribuição sugerida da semana
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((d) => (
            <div key={d} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_LABEL[d]}
              </div>
              <div className="mt-1 text-xl font-bold">{byWeekday[d]?.length ?? 0}</div>
              <div className="mt-2 space-y-1">
                {(byWeekday[d] ?? []).slice(0, 4).map((r) => (
                  <button
                    key={r.clientUid}
                    onClick={() => setOpenUid(r.clientUid)}
                    className="flex w-full items-center gap-1.5 truncate text-left text-xs hover:underline"
                  >
                    <span
                      className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[r.plan.color] ?? SIGNAL_DOT.sem_dado}`}
                    />
                    <span className="truncate">{r.clientName}</span>
                  </button>
                ))}
                {(byWeekday[d]?.length ?? 0) > 4 ? (
                  <div className="text-[11px] text-muted-foreground">
                    +{(byWeekday[d]?.length ?? 0) - 4} clientes
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Vermelhos ficam na segunda e terça, amarelos na quarta, verdes na quinta e sexta. Crise e revisão
          estratégica abrem a semana.
        </p>
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Calculando cadência da carteira...</Card>
      ) : rows.length === 0 ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          Nenhum cliente com gatilho nesses filtros.
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{rows.length} clientes listados</div>
          {rows.slice(0, 200).map((r) => (
            <CadenceCard key={r.clientUid} row={r} onOpen={() => setOpenUid(r.clientUid)} />
          ))}
          {rows.length > 200 ? (
            <div className="text-xs text-muted-foreground">
              Mostrando os 200 mais urgentes — refine os filtros para ver o restante.
            </div>
          ) : null}
        </div>
      )}

      {openUid ? <CsClientModal clientUid={openUid} onClose={() => setOpenUid(null)} /> : null}
    </div>
  );
}
