import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getCsTaskOptions, saveCsTask, type CsTask } from "@/lib/cs-tasks.functions";
import { CS_TASK_TYPES, CS_TASK_TYPE_LABEL, type CsTaskType } from "@/lib/cs-types";
import { COMPLETED_VIA_LABEL } from "@/lib/cs-follow-up-types";
import {
  CalendarClock,
  Check,
  ClipboardList,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

export const TASK_TYPE_ICON: Record<CsTaskType, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  ligacao: Phone,
  reuniao: Users,
  outro: ClipboardList,
};

/** Selo do tipo da tarefa (ícone + rótulo). */
export function TaskTypeBadge({ type }: { type: string | null | undefined }) {
  const t = (CS_TASK_TYPES as readonly string[]).includes(type ?? "")
    ? (type as CsTaskType)
    : "outro";
  const Icon = TASK_TYPE_ICON[t];
  return (
    <Badge variant="outline" className="gap-1 text-[10px]">
      <Icon className="h-3 w-3" /> {CS_TASK_TYPE_LABEL[t]}
    </Badge>
  );
}

/** Como a tarefa foi concluída — destaca a evidência do canal. */
export function CompletedBadge({
  via,
  at,
}: {
  via: string | null | undefined;
  at: string | null | undefined;
}) {
  const when = at
    ? new Date(at).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const Icon = via === "evidencia" ? ShieldCheck : Check;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-600"
      title={via ? `Concluída ${COMPLETED_VIA_LABEL[via] ?? via}` : "Concluída"}
    >
      <Icon className="h-3 w-3" /> Concluída {via ? (COMPLETED_VIA_LABEL[via] ?? "") : ""}
      {when ? ` · ${when}` : ""}
    </Badge>
  );
}

/** Aviso, em tarefa de canal pendente, de que o check vem do próprio canal. */
export function AwaitingEvidencePill({ type }: { type: string }) {
  const label = type === "email" ? "e-mail" : "WhatsApp";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground"
      title={`Concluída automaticamente quando o ${label} vinculado registrar o envio para este cliente.`}
    >
      <ShieldCheck className="h-3 w-3" /> Conclui ao enviar {label}
    </span>
  );
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Criar/editar tarefa. Se `clientUid` vier fixo (ficha da empresa), pula a
 * busca de empresa. Tarefas de e-mail/WhatsApp nascem sem botão de check:
 * concluem quando o canal vinculado registra o envio.
 */
export function CsTaskDialog({
  clientUid,
  task,
  evidenceChannels,
  onClose,
  onSaved,
}: {
  clientUid?: string;
  task?: CsTask | null;
  evidenceChannels: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const optionsFn = useServerFn(getCsTaskOptions);
  const saveFn = useServerFn(saveCsTask);

  const [q, setQ] = useState("");
  const [client, setClient] = useState<{ uid: string; name: string } | null>(
    task
      ? { uid: task.clientUid, name: task.clientName }
      : clientUid
        ? { uid: clientUid, name: "" }
        : null,
  );
  const [type, setType] = useState<CsTaskType>(task?.taskType ?? "whatsapp");
  const [title, setTitle] = useState(task?.title ?? "");
  const [contactId, setContactId] = useState<string>(task?.contactId ?? "");
  const [ownerId, setOwnerId] = useState<string>(task?.ownerId ?? "");
  const [dueAt, setDueAt] = useState(() =>
    toLocalInput(task ? new Date(task.dueAt) : new Date(Date.now() + 3600000)),
  );
  const [notes, setNotes] = useState(task?.notes ?? "");

  const search = useQuery({
    queryKey: ["cs-task-options", "clients", q],
    queryFn: () => optionsFn({ data: { q } }),
    enabled: !client,
  });
  const options = useQuery({
    queryKey: ["cs-task-options", client?.uid ?? ""],
    queryFn: () => optionsFn({ data: { clientUid: client!.uid } }),
    enabled: !!client,
  });
  useEffect(() => {
    if (!ownerId && options.data?.currentUserId && !task) setOwnerId(options.data.currentUserId);
  }, [options.data, ownerId, task]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: task?.id,
          clientUid: client!.uid,
          contactId: contactId || null,
          ownerId: ownerId || null,
          title: title.trim() || `${CS_TASK_TYPE_LABEL[type]} — ${client?.name ?? ""}`.trim(),
          taskType: type,
          dueAt: new Date(dueAt).toISOString(),
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success(task ? "Tarefa atualizada" : "Tarefa criada");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  if (typeof document === "undefined") return null;
  const needsEvidence = evidenceChannels.includes(type);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card className="mt-10 w-full max-w-lg space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4" /> {task ? "Editar tarefa" : "Nova tarefa"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!clientUid && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Empresa</p>
            {client ? (
              <div className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
                <span className="truncate">{client.name || client.uid}</span>
                {!task && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setClient(null)}
                  >
                    trocar
                  </button>
                )}
              </div>
            ) : (
              <>
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar empresa pelo nome…"
                />
                <div className="max-h-40 overflow-auto rounded-md border">
                  {(search.data?.clients ?? []).map((c) => (
                    <button
                      key={c.client_uid}
                      type="button"
                      onClick={() => setClient({ uid: c.client_uid, name: c.nome_empresa })}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate">{c.nome_empresa}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {c.client_uid}
                      </span>
                    </button>
                  ))}
                  {search.data && search.data.clients.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma empresa.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Tipo</p>
          <div className="flex flex-wrap gap-1.5">
            {CS_TASK_TYPES.map((t) => {
              const Icon = TASK_TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                    type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3 w-3" /> {CS_TASK_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
          {needsEvidence && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Tarefa de {CS_TASK_TYPE_LABEL[type]} não tem check manual: é concluída sozinha quando
              o {type === "email" ? "e-mail" : "WhatsApp"} vinculado registrar o envio para esta
              empresa.
            </p>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Título</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${CS_TASK_TYPE_LABEL[type]} — o que precisa ser feito?`}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Prazo</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Responsável</span>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Sem responsável</option>
              {(options.data?.profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Contato (opcional)</span>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              disabled={!client}
            >
              <option value="">Qualquer contato da empresa</option>
              {(options.data?.contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.email ? ` · ${c.email}` : ""}
                  {c.whatsapp ? ` · ${c.whatsapp}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Observações (opcional)"
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!client || save.isPending} onClick={() => save.mutate()}>
            <Check className="mr-1 h-4 w-4" /> {task ? "Salvar" : "Criar tarefa"}
          </Button>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
