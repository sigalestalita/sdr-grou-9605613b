import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteTouch, listLeadTouches, saveTouch } from "@/lib/touches.functions";
import {
  TOUCH_ACTIONS,
  TOUCH_ACTION_LABEL,
  TOUCH_CHANNELS,
  TOUCH_CHANNEL_LABEL,
  TOUCH_OUTCOMES,
  TOUCH_OUTCOME_LABEL,
  actionLabel,
  channelLabel,
  daysSince,
  outcomeLabel,
} from "@/lib/touch-types";
import {
  Plus,
  Trash2,
  Phone,
  Mail,
  MessageCircle,
  Linkedin,
  Users,
  CalendarClock,
  Activity,
  AlertTriangle,
} from "lucide-react";

function ChannelIcon({ channel }: { channel: string }) {
  const cls = "h-3.5 w-3.5";
  if (channel === "whatsapp" || channel === "sms") return <MessageCircle className={cls} />;
  if (channel === "ligacao") return <Phone className={cls} />;
  if (channel === "email") return <Mail className={cls} />;
  if (channel === "linkedin") return <Linkedin className={cls} />;
  if (channel === "presencial" || channel === "reuniao") return <Users className={cls} />;
  return <Activity className={cls} />;
}

type TouchRow = {
  id: string;
  touch_number: number;
  author_id: string | null;
  channel: string;
  action_type: string;
  outcome: string;
  notes: string | null;
  occurred_at: string;
  next_follow_up_at: string | null;
};

type TouchInput = {
  id?: string;
  channel: (typeof TOUCH_CHANNELS)[number];
  actionType: (typeof TOUCH_ACTIONS)[number];
  outcome: (typeof TOUCH_OUTCOMES)[number];
  notes?: string;
  nextFollowUpAt?: string | null;
};

export function TouchSequence({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listLeadTouches);
  const saveFn = useServerFn(saveTouch);
  const delFn = useServerFn(deleteTouch);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TouchRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lead-touches", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead-touches", leadId] });
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["kanban"] });
  };

  const save = useMutation({
    mutationFn: (input: TouchInput & { leadId: string }) => saveFn({ data: input }),
    onSuccess: () => {
      toast.success("Touch registrado");
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Touch removido"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const touches = (data?.touches ?? []) as TouchRow[];
  const profilesById = useMemo(
    () => new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id])),
    [data?.profiles],
  );
  const rules = data?.rules;
  const last = touches[touches.length - 1] ?? null;
  const sinceLast = daysSince(last?.occurred_at ?? null);
  const nextFollowUp = touches
    .map((t) => t.next_follow_up_at)
    .filter((v): v is string => !!v)
    .sort()
    .find((v) => new Date(v).getTime() >= Date.now() - 86400000 * 365) ?? null;
  const followUpLate = nextFollowUp ? new Date(nextFollowUp).getTime() < Date.now() : false;
  const belowMin = rules ? touches.length < rules.minTouchesBeforeDiscard : false;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" /> Sequência de Touches
          </h2>
          <p className="text-xs text-muted-foreground">
            Histórico padronizado das tentativas de contato deste lead.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar Touch
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Touches" value={String(touches.length)} />
        <Stat label="Último canal" value={channelLabel(last?.channel)} />
        <Stat
          label="Último contato"
          value={sinceLast == null ? "—" : sinceLast === 0 ? "hoje" : `há ${sinceLast}d`}
        />
        <Stat
          label="Próximo follow-up"
          value={nextFollowUp ? format(new Date(nextFollowUp), "dd/MM HH:mm", { locale: ptBR }) : "—"}
          alert={followUpLate}
        />
      </div>

      {(followUpLate || (belowMin && touches.length > 0)) && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          {followUpLate && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Follow-up vencido.
            </span>
          )}
          {belowMin && rules && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Abaixo do mínimo de {rules.minTouchesBeforeDiscard} tentativas.
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando touches…</p>
      ) : touches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum touch registrado. Comece a cadência clicando em “Adicionar Touch”.
        </p>
      ) : (
        <div className="space-y-3">
          {touches.map((t) => (
            <div key={t.id} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">Touch {t.touch_number}</Badge>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <ChannelIcon channel={t.channel} /> {channelLabel(t.channel)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{outcomeLabel(t.outcome)}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(t.occurred_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    title="Remover touch"
                    onClick={() => remove.mutate(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm">{actionLabel(t.action_type)}</p>
              {t.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.notes}</p>}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>Responsável: {t.author_id ? profilesById.get(t.author_id) ?? "—" : "—"}</span>
                {t.next_follow_up_at && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Follow-up {format(new Date(t.next_follow_up_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {touches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Timeline</h3>
          <ol className="relative border-l pl-4 space-y-2">
            {touches.map((t) => (
              <li key={`tl-${t.id}`} className="text-xs text-muted-foreground">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                <span className="font-medium text-foreground">
                  {format(new Date(t.occurred_at), "dd/MM", { locale: ptBR })}
                </span>{" "}
                — {channelLabel(t.channel)} • {actionLabel(t.action_type)} • {outcomeLabel(t.outcome)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {open && (
        <TouchDialog
          initial={editing}
          pending={save.isPending}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSubmit={(payload) => save.mutate({ leadId, ...payload })}
        />
      )}
    </Card>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${alert ? "border-amber-500/50 bg-amber-500/10" : "bg-muted/30"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function TouchDialog({
  initial,
  pending,
  onClose,
  onSubmit,
}: {
  initial: TouchRow | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    id?: string;
    channel: (typeof TOUCH_CHANNELS)[number];
    actionType: (typeof TOUCH_ACTIONS)[number];
    outcome: (typeof TOUCH_OUTCOMES)[number];
    notes?: string;
    nextFollowUpAt?: string | null;
  }) => void;
}) {
  const [channel, setChannel] = useState<string>(initial?.channel ?? "whatsapp");
  const [actionType, setActionType] = useState<string>(initial?.action_type ?? "mensagem_enviada");
  const [outcome, setOutcome] = useState<string>(initial?.outcome ?? "sem_resposta");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [nextFollowUp, setNextFollowUp] = useState(
    initial?.next_follow_up_at ? initial.next_follow_up_at.slice(0, 16) : "",
  );

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="relative z-[101] p-6 w-full max-w-md space-y-4 bg-card border shadow-2xl my-auto max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">{initial ? "Editar touch" : "Adicionar Touch"}</h2>
          <p className="text-xs text-muted-foreground">Data, hora e responsável são registrados automaticamente.</p>
        </div>
        <div className="space-y-3">
          <Field label="Canal">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {TOUCH_CHANNELS.map((c) => (
                <option key={c} value={c}>{TOUCH_CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo da ação">
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {TOUCH_ACTIONS.map((a) => (
                <option key={a} value={a}>{TOUCH_ACTION_LABEL[a]}</option>
              ))}
            </select>
          </Field>
          <Field label="Resultado">
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {TOUCH_OUTCOMES.map((o) => (
                <option key={o} value={o}>{TOUCH_OUTCOME_LABEL[o]}</option>
              ))}
            </select>
          </Field>
          <Field label="Próximo follow-up (opcional)">
            <Input type="datetime-local" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
          </Field>
          <Field label="Observações">
            <Textarea
              rows={3}
              placeholder="Ex.: disse que está em férias e pediu retorno na próxima semana."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              onSubmit({
                ...(initial ? { id: initial.id } : {}),
                channel: channel as (typeof TOUCH_CHANNELS)[number],
                actionType: actionType as (typeof TOUCH_ACTIONS)[number],
                outcome: outcome as (typeof TOUCH_OUTCOMES)[number],
                notes: notes.trim(),
                nextFollowUpAt: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
              })
            }
          >
            {pending ? "Salvando…" : "Salvar touch"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
