import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CS_FOLLOWUP_CHANNELS,
  CS_FOLLOWUP_CHANNEL_LABEL,
  CS_FOLLOWUP_OUTCOMES,
  CS_FOLLOWUP_OUTCOME_LABEL,
  type CsFollowUpChannel,
  type CsFollowUpOutcome,
} from "@/lib/cs-follow-up-types";
import {
  completeCsFollowUp,
  rescheduleCsFollowUp,
  type CsFollowUpItem,
} from "@/lib/cs-follow-ups.functions";
import { CalendarClock, Check, ShieldCheck, X } from "lucide-react";

/** Valor para <input type="datetime-local"> no fuso local. */
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Ações do calendário de CS: registrar o resultado do follow-up na timeline
 * do cliente e/ou reagendar para uma nova data.
 */
export function CsFollowUpActionModal({
  item,
  mode,
  asManager,
  evidenceChannels = [],
  onClose,
  onDone,
}: {
  item: CsFollowUpItem;
  /** "resultado" abre focado no desfecho; "reagendar" abre focado na nova data. */
  mode: "resultado" | "reagendar";
  /** Gestão concluindo tarefa de canal sem o registro — justificativa obrigatória. */
  asManager?: boolean;
  /** Canais em que o resultado só vale com envio registrado pelo canal vinculado. */
  evidenceChannels?: readonly string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const completeFn = useServerFn(completeCsFollowUp);
  const rescheduleFn = useServerFn(rescheduleCsFollowUp);

  const [outcome, setOutcome] = useState<CsFollowUpOutcome>("atendimento_concluido");
  const [channel, setChannel] = useState<CsFollowUpChannel>(() => {
    if (item.kind === "tarefa" && item.taskType && item.taskType !== "outro")
      return item.taskType as CsFollowUpChannel;
    return item.kind === "reuniao" ? "reuniao" : "whatsapp";
  });
  const channelNeedsEvidence = evidenceChannels.includes(channel) && outcome !== "sem_resposta";
  const [notes, setNotes] = useState("");
  const [nextAt, setNextAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (mode === "reagendar" ? 1 : 7));
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [withNext, setWithNext] = useState(mode === "reagendar");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const base = {
    kind: item.kind,
    refId: item.refId ?? null,
    clientUid: item.clientUid,
    title: item.title,
  };

  const save = useMutation({
    mutationFn: async (action: "resultado" | "reagendar") => {
      const iso = new Date(nextAt).toISOString();
      if (action === "reagendar") {
        return rescheduleFn({ data: { ...base, nextAt: iso, notes: notes || null } });
      }
      return completeFn({
        data: {
          ...base,
          outcome,
          channel,
          notes: notes || null,
          nextAt: withNext ? iso : null,
          asManager: asManager || undefined,
        },
      });
    },
    onSuccess: (_r, action) => {
      toast.success(action === "reagendar" ? "Follow-up reagendado" : "Resultado registrado");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card className="mt-10 w-full max-w-lg space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="h-4 w-4" />
              {mode === "reagendar" ? "Reagendar follow-up" : "Registrar resultado"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {item.clientName} · <span className="font-mono">{item.clientUid}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{item.title}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {mode === "resultado" && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Resultado</p>
              <div className="flex flex-wrap gap-1.5">
                {CS_FOLLOWUP_OUTCOMES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      setOutcome(o);
                      if (o === "sem_resposta" || o === "aguardando_cliente") setWithNext(true);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      outcome === o ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    {CS_FOLLOWUP_OUTCOME_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Canal</p>
              <div className="flex flex-wrap gap-1.5">
                {CS_FOLLOWUP_CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                      channel === c ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    {evidenceChannels.includes(c) && <ShieldCheck className="h-3 w-3" />}
                    {CS_FOLLOWUP_CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
              {channelNeedsEvidence && !asManager && (
                <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {CS_FOLLOWUP_CHANNEL_LABEL[channel]} só conta com o envio registrado pelo canal
                  vinculado do CS. O último envio para esta empresa é procurado automaticamente; sem
                  ele, o resultado não é aceito.
                </p>
              )}
              {asManager && (
                <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px]">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Conclusão pela gestão sem o registro do canal. A justificativa abaixo fica na
                  timeline da empresa.
                </p>
              )}
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {mode === "reagendar" ? "Nova data e hora" : "Observações"}
          </p>
          {mode === "reagendar" ? (
            <input
              type="datetime-local"
              value={nextAt}
              onChange={(e) => setNextAt(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          ) : (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                asManager ? "Justificativa (obrigatória)" : "O que foi tratado com o cliente?"
              }
            />
          )}
        </div>

        {mode === "resultado" && (
          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withNext}
                onChange={(e) => setWithNext(e.target.checked)}
              />
              Agendar próximo follow-up
            </label>
            {withNext && (
              <input
                type="datetime-local"
                value={nextAt}
                onChange={(e) => setNextAt(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            )}
          </div>
        )}

        {mode === "reagendar" && (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Motivo do reagendamento (opcional)"
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className="text-[10px]">
            {item.ownerName}
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            {mode === "resultado" ? (
              <Button
                size="sm"
                disabled={save.isPending || (asManager && notes.trim().length < 5)}
                onClick={() => save.mutate("resultado")}
                className="gap-1"
              >
                <Check className="h-4 w-4" /> Registrar na timeline
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={save.isPending || !nextAt}
                onClick={() => save.mutate("reagendar")}
                className="gap-1"
              >
                <CalendarClock className="h-4 w-4" /> Reagendar
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
