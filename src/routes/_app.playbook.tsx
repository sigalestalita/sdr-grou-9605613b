import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ANTI_NO_SHOW,
  APPROACH_TEMPLATES,
  BANT_GUIDE,
  DISCARD_REASONS,
  FUNNEL_GUIDE,
  OBJECTIONS,
  SALES_MATERIALS,
  SDR_TARGETS,
  SDR_TRACKS,
  SLA_FIRST_TOUCH_MINUTES,
  TRACK_LABEL,
  TRACK_STEPS,
  TRACK_SUBTITLE,
  type SdrTrack,
} from "@/lib/sdr-playbook";
import { BookOpen, Target, Clock, Route as RouteIcon, ShieldAlert, MessageSquareQuote, FileStack, CalendarCheck } from "lucide-react";

export const Route = createFileRoute("/_app/playbook")({
  component: PlaybookSdrPage,
  head: () => ({
    meta: [
      { title: "Playbook SDR | Grou Compass" },
      {
        name: "description",
        content:
          "Playbook de Pré-Vendas SDR Grou 2026: jornada do lead inbound, cadências por porte, scripts, filtro BANT, objeções e metas.",
      },
      { property: "og:title", content: "Playbook SDR | Grou Compass" },
      {
        property: "og:description",
        content: "Jornada completa de atendimento do lead inbound: SLA, cadências multicanais, BANT e passagem de bastão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PlaybookSdrPage() {
  const [track, setTrack] = useState<SdrTrack>("pme");

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Playbook SDR — Pré-vendas inbound
        </h1>
        <p className="text-sm text-muted-foreground">
          Jornada de atendimento, cadências multicanais e qualificação BANT que alimentam a cadência automatizada do módulo.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Target className="h-4 w-4" />} label="Reuniões/mês (global)" value={String(SDR_TARGETS.meetingsPerMonthGlobal)} />
        <Kpi icon={<Target className="h-4 w-4" />} label="Meta por SDR" value={`${SDR_TARGETS.meetingsPerMonthPerSdr}/mês`} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="SLA 1º atendimento" value={`< ${SLA_FIRST_TOUCH_MINUTES} min`} />
        <Kpi icon={<CalendarCheck className="h-4 w-4" />} label="Presença na agenda" value={`${Math.round(SDR_TARGETS.showRate * 100)}%`} />
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <RouteIcon className="h-4 w-4" /> Jornada do lead inbound
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-1">Etapa do funil</th>
                <th className="text-left py-1">Objetivo e atividade principal</th>
                <th className="text-left py-1">Gatilho para avançar</th>
              </tr>
            </thead>
            <tbody>
              {FUNNEL_GUIDE.map((f) => (
                <tr key={f.stage} className="border-t align-top">
                  <td className="py-2 font-medium">{f.stage}</td>
                  <td className="py-2 text-muted-foreground">{f.objective}</td>
                  <td className="py-2 text-muted-foreground">{f.trigger}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Cadências multicanais por porte</h2>
            <p className="text-xs text-muted-foreground">{TRACK_SUBTITLE[track]}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {SDR_TRACKS.map((t) => (
              <Button key={t} size="sm" variant={t === track ? "default" : "outline"} onClick={() => setTrack(t)}>
                {TRACK_LABEL[t]}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {TRACK_STEPS[track].map((s) => (
            <div
              key={s.id}
              className={`rounded-lg border p-3 space-y-1 ${s.breakup ? "border-destructive/40 bg-destructive/5" : "bg-muted/20"}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">Dia {s.day}</Badge>
                <Badge variant="outline" className="text-[10px]">
                  {s.period === "manha" ? "Manhã" : "Tarde"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">{s.channelTag}</Badge>
              </div>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-[11px] text-muted-foreground">“{s.script}”</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Filtro BANT — sondagem de RH</h2>
          {BANT_GUIDE.map((g) => (
            <div key={g.key} className="rounded-lg border p-3 space-y-1 bg-muted/20">
              <p className="text-sm font-medium">{g.label}</p>
              <p className="text-[11px] text-muted-foreground">{g.focus}</p>
              <ul className="space-y-1 pt-1">
                {g.questions.map((q) => (
                  <li key={q} className="text-[11px] text-muted-foreground">• {q}</li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <MessageSquareQuote className="h-4 w-4" /> Contorno de objeções
            </h2>
            {OBJECTIONS.map((o) => (
              <div key={o.objection} className="rounded-lg border p-3 bg-muted/20">
                <p className="text-sm font-medium">“{o.objection}”</p>
                <p className="text-[11px] text-muted-foreground mt-1">{o.response}</p>
              </div>
            ))}
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Formatos base de abordagem</h2>
            {APPROACH_TEMPLATES.map((t) => (
              <div key={t.title} className="rounded-lg border p-3 bg-muted/20">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{t.body}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Motivos de descarte padronizados
          </h2>
          {DISCARD_REASONS.map((d) => (
            <div key={d.reason} className="rounded-lg border p-3 bg-muted/20 space-y-1">
              <p className="text-sm font-medium">{d.reason}</p>
              <p className="text-[11px] text-muted-foreground">{d.criteria}</p>
              <p className="text-[11px] text-primary">{d.action}</p>
            </div>
          ))}
        </Card>

        <div className="space-y-4">
          <Card className="p-5 space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" /> Passagem de bastão & anti-no-show
            </h2>
            <ul className="space-y-1">
              {ANTI_NO_SHOW.map((a) => (
                <li key={a} className="text-xs text-muted-foreground">• {a}</li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <FileStack className="h-4 w-4" /> Materiais de apoio
            </h2>
            {SALES_MATERIALS.map((m) => (
              <div key={m.title}>
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-[11px] text-muted-foreground">{m.description}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}
