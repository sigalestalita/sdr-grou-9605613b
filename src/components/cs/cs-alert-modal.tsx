import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resolveCsAlert } from "@/lib/cs.functions";
import {
  CS_AGENDA_TYPES,
  CS_AGENDA_TYPE_LABEL,
  CS_ALERT_TYPE_LABEL,
  CS_CONTACT_TYPES,
  CS_CONTACT_TYPE_LABEL,
} from "@/lib/cs-types";
import { AlertTriangle, X } from "lucide-react";

type AlertRow = {
  id: string;
  client_uid: string;
  alert_type: string;
  reason: string;
};

/** Modal obrigatório de tratativa: sem preencher, o alerta não sai do card. */
export function CsAlertModal({
  alertId,
  alert,
  onClose,
  onDone,
}: {
  alertId: string;
  alert: AlertRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const resolveFn = useServerFn(resolveCsAlert);
  const [contactType, setContactType] = useState<string>("whatsapp");
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [agendaType, setAgendaType] = useState<string>("");
  const [observation, setObservation] = useState("");
  const [autossuficiente, setAutossuficiente] = useState(false);

  const resolve = useMutation({
    mutationFn: () =>
      resolveFn({
        data: {
          alertId,
          contact_type: contactType as never,
          whatsapp_answered: contactType === "whatsapp" ? answered : null,
          agenda_type: contactType === "agenda" ? (agendaType as never) : null,
          observation: observation.trim() || null,
          cliente_autossuficiente: autossuficiente,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.followUpAt
          ? "Tratativa registrada — follow-up automático agendado em 48h"
          : "Tratativa registrada",
      );
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  const canSave =
    !!contactType &&
    (contactType !== "whatsapp" || answered !== null) &&
    (contactType !== "agenda" || !!agendaType);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-background/90 backdrop-blur-md grid place-items-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md p-6 space-y-4 bg-popover border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Registrar tratativa
            </h2>
            <p className="text-xs text-muted-foreground">
              {alert ? `${CS_ALERT_TYPE_LABEL[alert.alert_type] ?? alert.alert_type} — ${alert.reason}` : "Alerta de CS"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tipo de contato realizado</label>
            <div className="flex flex-wrap gap-1">
              {CS_CONTACT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContactType(t)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    contactType === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  {CS_CONTACT_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {contactType === "whatsapp" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">O cliente respondeu?</label>
              <div className="flex gap-1">
                {[
                  { v: true, l: "Sim, respondeu" },
                  { v: false, l: "Não respondeu" },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setAnswered(o.v)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      answered === o.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              {answered === false && (
                <p className="text-[11px] text-warning">
                  Sem resposta gera follow-up automático em 48h e mantém o alerta em acompanhamento.
                </p>
              )}
            </div>
          )}

          {contactType === "agenda" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo de agenda</label>
              <select
                value={agendaType}
                onChange={(e) => setAgendaType(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Selecione…</option>
                {CS_AGENDA_TYPES.map((a) => (
                  <option key={a} value={a}>{CS_AGENDA_TYPE_LABEL[a]}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                A agenda gera automaticamente a tag cumulativa correspondente no cliente.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={autossuficiente}
              onChange={(e) => setAutossuficiente(e.target.checked)}
            />
            Cliente autossuficiente (usa a plataforma sem precisar de acompanhamento)
          </label>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Observação</label>
            <Textarea
              rows={3}
              placeholder="O que foi tratado, próximos passos, riscos…"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!canSave || resolve.isPending} onClick={() => resolve.mutate()}>
            {resolve.isPending ? "Salvando…" : "Salvar tratativa"}
          </Button>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
