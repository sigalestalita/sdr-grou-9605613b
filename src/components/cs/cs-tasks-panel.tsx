import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  completeCsTask,
  listCsTasks,
  setCsTaskStatus,
  type CsTask,
} from "@/lib/cs-tasks.functions";
import {
  AwaitingEvidencePill,
  CompletedBadge,
  CsTaskDialog,
  TaskTypeBadge,
} from "@/components/cs/cs-task-dialog";
import { Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Tarefas da empresa (ficha). E-mail/WhatsApp mostram "conclui ao enviar";
 * ligação/reunião/outro têm check manual. A gestão conclui tarefa de canal
 * com justificativa.
 */
export function CsTasksPanel({
  clientUid,
  evidenceChannels,
  isManager,
}: {
  clientUid: string;
  evidenceChannels: readonly string[];
  isManager: boolean;
}) {
  const listFn = useServerFn(listCsTasks);
  const completeFn = useServerFn(completeCsTask);
  const statusFn = useServerFn(setCsTaskStatus);
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [dialog, setDialog] = useState<{ task: CsTask | null } | null>(null);

  const key = ["cs-tasks", clientUid];
  const q = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { clientUid, status: "todas", limit: 100 } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-follow-ups"] });
  };
  const complete = useMutation({
    mutationFn: (v: { id: string; asManager?: boolean; notes?: string | null }) =>
      completeFn({ data: v }),
    onSuccess: () => {
      toast.success("Tarefa concluída");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const status = useMutation({
    mutationFn: (v: { id: string; action: "reabrir" | "cancelar" | "apagar" }) =>
      statusFn({ data: v }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const tasks = q.data?.tasks ?? [];
  const pending = tasks.filter((t) => t.status === "pendente");
  const done = tasks.filter((t) => t.status !== "pendente");
  const list = showDone ? tasks : pending;

  const managerComplete = (t: CsTask) => {
    const notes = window.prompt(
      `Concluir "${t.title}" sem o registro do canal. Justificativa (obrigatória):`,
    );
    if (notes === null) return;
    if (notes.trim().length < 5) {
      toast.error("Escreva uma justificativa (mínimo 5 caracteres)");
      return;
    }
    complete.mutate({ id: t.id, asManager: true, notes });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="text-[11px] text-muted-foreground hover:underline"
        >
          {showDone ? "Ocultar concluídas" : `${done.length} concluída(s)`}
        </button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => setDialog({ task: null })}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Tarefa
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-[12px] text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {showDone ? "Nenhuma tarefa." : "Nenhuma tarefa pendente."}
        </p>
      ) : (
        <ul className="divide-y">
          {list.map((t) => {
            const late = t.status === "pendente" && new Date(t.dueAt) < new Date();
            const needsEvidence = evidenceChannels.includes(t.taskType);
            return (
              <li key={t.id} className="space-y-1 py-2 text-[12px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`truncate font-medium ${t.status !== "pendente" ? "text-muted-foreground line-through" : ""}`}
                    >
                      {t.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      <span className={late ? "text-destructive" : ""}>
                        {late ? "atrasada · " : ""}
                        {when(t.dueAt)}
                      </span>
                      {" · "}
                      {t.ownerName}
                      {t.contactName ? ` · ${t.contactName}` : ""}
                    </p>
                  </div>
                  <TaskTypeBadge type={t.taskType} />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {t.status === "concluida" && (
                    <CompletedBadge via={t.completedVia} at={t.evidenceAt ?? t.doneAt} />
                  )}
                  {t.status === "cancelada" && (
                    <span className="text-[11px] text-muted-foreground">Cancelada</span>
                  )}
                  {t.status === "pendente" && needsEvidence && (
                    <AwaitingEvidencePill type={t.taskType} />
                  )}
                  {t.status === "pendente" && !needsEvidence && (
                    <button
                      type="button"
                      disabled={complete.isPending}
                      onClick={() => complete.mutate({ id: t.id })}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-600 hover:bg-emerald-500/20"
                    >
                      <Check className="h-3 w-3" /> Concluir
                    </button>
                  )}
                  {t.status === "pendente" && needsEvidence && isManager && (
                    <button
                      type="button"
                      disabled={complete.isPending}
                      onClick={() => managerComplete(t)}
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                      title="Concluir sem o registro do canal, com justificativa"
                    >
                      <Check className="h-3 w-3" /> Gestão
                    </button>
                  )}
                  {t.status === "pendente" && (
                    <button
                      type="button"
                      onClick={() => setDialog({ task: t })}
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  )}
                  {t.status !== "pendente" && (
                    <button
                      type="button"
                      onClick={() => status.mutate({ id: t.id, action: "reabrir" })}
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                    >
                      <RotateCcw className="h-3 w-3" /> Reabrir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Apagar esta tarefa?"))
                        status.mutate({ id: t.id, action: "apagar" });
                    }}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Apagar tarefa"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {t.evidenceTitle && t.completedVia === "evidencia" && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    Evidência: {t.evidenceTitle}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <CsTaskDialog
          clientUid={clientUid}
          task={dialog.task}
          evidenceChannels={evidenceChannels}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
