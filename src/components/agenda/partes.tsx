import { Link } from "@tanstack/react-router";
import { Bot, Check, MessageCircle, User } from "lucide-react";
import { PRIORITY_COLOR, PRIORITY_LABEL } from "@/lib/lead-types";
import type { SituacaoDoLead } from "@/lib/fup-agenda";
import { diaCurto, hhmm } from "./formatos";
import type { Compromisso } from "./tipos";

export function PontoDePrioridade({ prioridade }: { prioridade: string | null }) {
  const p = prioridade ?? "pendente";
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: PRIORITY_COLOR[p] ?? "var(--muted-foreground)" }}
      title={`Prioridade ${PRIORITY_LABEL[p] ?? p}`}
    />
  );
}

export function NomeDoLead({
  leadId,
  nome,
  empresa,
  etapa,
}: {
  leadId: string;
  nome: string;
  empresa: string | null;
  etapa?: string | null;
}) {
  return (
    <div className="min-w-0">
      <Link
        to="/lead/$id"
        params={{ id: leadId }}
        className="block truncate text-sm font-medium hover:underline"
      >
        {nome}
      </Link>
      {(empresa || etapa) && (
        <p className="truncate text-[11px] text-muted-foreground">
          {[empresa, etapa].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** "Dia 3 de 10" e uma barra fina dos toques feitos sobre o total da trilha. */
export function ProgressoDaTrilha({ situacao }: { situacao: SituacaoDoLead }) {
  const dia = situacao.proximo?.day ?? situacao.ultimoDia;
  const fracao = situacao.total ? situacao.feitos / situacao.total : 0;
  return (
    <div
      className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground"
      title={`${situacao.feitos} de ${situacao.total} toques da trilha feitos`}
    >
      <span className="tabular-nums">
        Dia {dia} de {situacao.ultimoDia}
      </span>
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${Math.round(fracao * 100)}%` }}
        />
      </span>
    </div>
  );
}

export function LinkAtender({ leadId }: { leadId: string }) {
  return (
    <Link
      to="/lead/$id"
      params={{ id: leadId }}
      className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
    >
      <MessageCircle className="h-3.5 w-3.5" /> Atender
    </Link>
  );
}

/** Follow-up com hora marcada: agendado à mão, sequência de WhatsApp ou touch. */
export function LinhaDeCompromisso({
  item,
  mostrarDono,
  atrasado,
  ocupado,
  onConcluir,
}: {
  item: Compromisso;
  mostrarDono: boolean;
  atrasado?: boolean;
  ocupado: boolean;
  onConcluir: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 ${
        item.done
          ? "border-emerald-500/30 bg-emerald-500/5"
          : atrasado
            ? "border-destructive/30 bg-destructive/5"
            : "border-border"
      }`}
    >
      <div className="w-24 shrink-0 text-[12px] tabular-nums text-muted-foreground">
        {atrasado ? diaCurto(item.dueAt) : hhmm(item.dueAt)}
        {atrasado && <span className="block">{hhmm(item.dueAt)}</span>}
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
        title={item.kind === "auto" ? "Sequência automática de WhatsApp" : "Agendado à mão"}
      >
        {item.kind === "auto" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
        {item.kind === "auto" ? "IA" : "Manual"}
      </span>
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
        <PontoDePrioridade prioridade={item.priority} />
        <div className="min-w-0">
          <NomeDoLead leadId={item.leadId} nome={item.leadName} empresa={item.company} />
          <p
            className={`truncate text-[11px] ${item.done ? "line-through" : ""} text-muted-foreground`}
          >
            {item.title}
            {item.subtitle ? ` · ${item.subtitle}` : ""}
            {mostrarDono ? ` · ${item.assignedName}` : ""}
          </p>
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <LinkAtender leadId={item.leadId} />
        {/* Sequência automática não se desfaz: concluir encerra a inscrição. */}
        {!(item.done && item.kind === "auto") && (
          <button
            type="button"
            disabled={ocupado}
            onClick={onConcluir}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] disabled:opacity-50 ${
              item.done
                ? "border-border text-muted-foreground hover:bg-muted"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
            }`}
          >
            <Check className="h-3.5 w-3.5" /> {item.done ? "Desfazer" : "Feito"}
          </button>
        )}
      </div>
    </div>
  );
}
