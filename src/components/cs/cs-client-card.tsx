import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignalStrip } from "@/components/cs/signal-strip";
import {
  CS_ORIGIN_LABEL,
  CS_SIGNAL_CLASS,
  CS_SIGNAL_LABEL,
  CS_STAGES,
  CS_STAGE_LABEL,
  analyzeSignalTrend,
  daysBetween,
  healthLabel,
  type CsSignal,
  type CsStage,
} from "@/lib/cs-types";
import { AlertTriangle, Bell, Building2, Sparkles } from "lucide-react";

export type CsCardClient = {
  client_uid: string;
  nome_empresa: string;
  cnpj?: string | null;
  origem: string;
  tipo_lead: string;
  journey_stage: string;
  current_signal?: string | null;
  health_score?: number | null;
  stage_entered_at?: string | null;
  cs_responsavel_id?: string | null;
};

export type CsCardAlert = { id: string; reason: string };

/** Metadados da planilha da sinaleira (última semana sincronizada). */
export type CsCardSheet = Record<string, unknown>;

const str = (v: unknown) => (v == null || v === "" ? null : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v: number | null) =>
  v == null ? null : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Card de cliente do board de CS: sinaleira, health score, tendência, SLA, tags e alertas. */
export function CsClientCard({
  client: c,
  history,
  weeks,
  ownerName,
  sheet,
  alerts = [],
  tags = [],
  slaDays = 0,
  moveDisabled = false,
  onOpen,
  onOpenAlert,
  onMove,
}: {
  client: CsCardClient;
  history: CsSignal[];
  weeks?: string[];
  ownerName: string;
  sheet?: CsCardSheet;
  alerts?: CsCardAlert[];
  tags?: string[];
  slaDays?: number;
  moveDisabled?: boolean;
  onOpen?: (clientUid: string) => void;
  onOpenAlert?: (alertId: string) => void;
  onMove?: (clientUid: string, stage: CsStage) => void;
}) {
  const trend = analyzeSignalTrend(history);
  const health = healthLabel(c.health_score ?? 0);
  const daysInStage = daysBetween(c.stage_entered_at) ?? 0;
  const slaBreach = slaDays > 0 && daysInStage > slaDays;

  return (
    <Card
      data-testid={`cs-card-${c.client_uid}`}
      className={`p-3 space-y-2 cursor-pointer hover:border-primary/50 ${
        c.current_signal === "vermelho" ? "border-red-500/40 bg-red-500/5" : ""
      }`}
      onClick={() => onOpen?.(c.client_uid)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 shrink-0" /> {c.nome_empresa}
          </p>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-mono">{c.client_uid}</span> · {ownerName}
          </p>
        </div>
        <Badge className={`text-[10px] shrink-0 ${CS_SIGNAL_CLASS[c.current_signal ?? "sem_dado"]}`}>
          {CS_SIGNAL_LABEL[c.current_signal ?? "sem_dado"]}
        </Badge>
      </div>

      <SignalStrip history={history} weeks={weeks} />

      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span className={health.cls}>Health {c.health_score ?? 0}</span>
        <span>· {CS_ORIGIN_LABEL[c.origem] ?? c.origem}</span>
        <span>· {daysInStage}d na etapa</span>
        {c.tipo_lead === "consultoria" && (
          <Badge variant="outline" className="text-[10px]">Consultoria</Badge>
        )}
      </div>

      {sheet && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-1">
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            {[
              ["CS", str(sheet.cs_atendimento)],
              ["Responsável", str(sheet.responsavel)],
              ["Tipo conta", str(sheet.tipo_conta)],
              ["Ciclo de vida", str(sheet.ciclo_vida)],
              ["Login PDA", str(sheet.login_pda)],
              ["Domínio", str(sheet.dominio)],
              ["Saldo atual", fmt(num(sheet.saldo_atual))],
              ["Meta mensal", fmt(num(sheet.meta_mensal))],
              ["Consumo últ. mês", fmt(num(sheet.consumo_ultimo_mes))],
              ["Créditos usados", fmt(num(sheet.creditos_utilizados))],
              ["Meses restantes", fmt(num(sheet.meses_restantes))],
              ["Exp. créditos", str(sheet.data_expiracao_creditos)],
              ["Exp. conta", str(sheet.data_expiracao_conta)],
              ["Status dados", str(sheet.status_dados)],
              ["Desabilitada", str(sheet.conta_desabilitada)],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <p key={k as string} className="truncate">
                  <span className="text-muted-foreground">{k}: </span>
                  <span className="font-medium">{v}</span>
                </p>
              ))}
          </div>
          {str(sheet.motivo) && (
            <p className="text-[10px] text-muted-foreground">
              <span className="font-medium">Motivo:</span> {str(sheet.motivo)}
            </p>
          )}
        </div>
      )}



      {(trend.kind === "critico" || trend.kind === "queda" || slaBreach) && (
        <p className="flex items-center gap-1 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3" />
          {trend.kind === "critico"
            ? `Vermelho há ${trend.weeks} semanas`
            : trend.kind === "queda"
              ? "Queda de engajamento"
              : `SLA da etapa estourado (${slaDays}d)`}
        </p>
      )}
      {trend.kind === "oportunidade" && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600">
          <Sparkles className="h-3 w-3" /> Verde há {trend.weeks} semanas — oportunidade de expansão
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from(new Set(tags)).slice(0, 5).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
        </div>
      )}

      {alerts.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAlert?.(alerts[0].id);
          }}
          className="w-full rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-left text-[11px] text-warning hover:bg-warning/20"
        >
          <span className="inline-flex items-center gap-1 font-medium">
            <Bell className="h-3 w-3" /> {alerts.length} alerta(s) — registrar tratativa
          </span>
          <span className="block truncate text-[10px]">{alerts[0].reason}</span>
        </button>
      )}

      <div className="flex gap-1">
        {CS_STAGES.filter((s) => s !== c.journey_stage).map((s) => (
          <button
            key={s}
            type="button"
            disabled={moveDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onMove?.(c.client_uid, s);
            }}
            className="rounded-md border px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50"
          >
            → {CS_STAGE_LABEL[s]}
          </button>
        ))}
      </div>
    </Card>
  );
}
