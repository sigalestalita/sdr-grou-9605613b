import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acknowledgeCsEscalation,
  ESCALATION_KIND_LABEL,
  ESCALATION_REASON_LABEL,
  listCsEscalations,
  reassignCsEscalation,
  sendCsEscalationEmail,
  type CsEscalation,
} from "@/lib/cs-escalations.functions";
import { AlertOctagon, Check, Mail, Undo2, UserRoundCog } from "lucide-react";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Escalações para a gestão: ações com a empresa que passaram do limite de
 * atraso ou ficaram sem nenhum contato. Ciência tira da lista até voltar a
 * escalar; reatribuir troca o responsável da tarefa/cadência.
 */
export function CsEscalationsPanel({
  owners,
  onChanged,
  compact,
}: {
  owners: { id: string; name: string }[];
  onChanged?: () => void;
  /** Início: só os primeiros itens e link para o dashboard. */
  compact?: boolean;
}) {
  const listFn = useServerFn(listCsEscalations);
  const ackFn = useServerFn(acknowledgeCsEscalation);
  const reassignFn = useServerFn(reassignCsEscalation);
  const emailFn = useServerFn(sendCsEscalationEmail);
  const qc = useQueryClient();
  const [owner, setOwner] = useState("");
  const [showAck, setShowAck] = useState(false);

  const q = useQuery({
    queryKey: ["cs-escalations", owner, showAck],
    queryFn: () => listFn({ data: { ownerId: owner || null, includeAcknowledged: showAck } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cs-escalations"] });
    onChanged?.();
  };
  const ack = useMutation({
    mutationFn: (v: { kind: CsEscalation["kind"]; refId: string; undo?: boolean }) =>
      ackFn({ data: v }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const reassign = useMutation({
    mutationFn: (v: { kind: "tarefa" | "cadencia"; refId: string; ownerId: string | null }) =>
      reassignFn({ data: v }),
    onSuccess: () => {
      toast.success("Responsável alterado");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const email = useMutation({
    mutationFn: () => emailFn({}),
    onSuccess: (r) =>
      toast.success(
        r.sent ? `E-mail enviado com ${r.sent} escalação(ões)` : `Nada enviado: ${r.skipped}`,
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const items = q.data?.items ?? [];
  const list = compact ? items.slice(0, 6) : items;
  const uidOf = (e: CsEscalation) => (e.kind === "reuniao" || e.kind === "alerta" ? null : e.refId);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertOctagon className="h-4 w-4 text-red-500" /> Escalações
          {q.data && (
            <Badge variant={q.data.active ? "destructive" : "secondary"} className="text-[10px]">
              {q.data.active}
            </Badge>
          )}
        </h2>
        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">Todo o time</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showAck}
                onChange={(e) => setShowAck(e.target.checked)}
              />
              incluir com ciência
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={email.isPending}
              onClick={() => email.mutate()}
            >
              <Mail className="mr-1 h-3.5 w-3.5" /> Enviar e-mail agora
            </Button>
          </div>
        )}
        {compact && (
          <Link to="/cs-dashboard" className="text-xs text-primary hover:underline">
            Ver dashboard
          </Link>
        )}
      </div>

      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma ação escalada. A regra está em Configurações CS → Tarefas e evidência.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Empresa</th>
                <th className="py-2 pr-3">Ação</th>
                <th className="py-2 pr-3">Responsável</th>
                <th className="py-2 pr-3">Venceu</th>
                <th className="py-2 pr-3">Atraso</th>
                <th className="py-2 pr-3">Motivo</th>
                {!compact && <th className="py-2 pr-3" />}
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr
                  key={`${e.kind}:${e.refId}`}
                  className={`border-b border-border/60 ${e.acknowledgedAt ? "opacity-60" : ""}`}
                >
                  <td className="py-2 pr-3 font-medium">
                    <Link
                      to="/empresas/$uid"
                      params={{ uid: e.clientUid }}
                      className="hover:underline"
                    >
                      {e.clientName}
                    </Link>
                  </td>
                  <td className="max-w-[28ch] truncate py-2 pr-3" title={e.title}>
                    <Badge variant="outline" className="mr-1 text-[10px]">
                      {ESCALATION_KIND_LABEL[e.kind]}
                    </Badge>
                    {e.title}
                  </td>
                  <td className="py-2 pr-3">
                    {!compact && uidOf(e) ? (
                      <select
                        value={e.ownerId ?? ""}
                        onChange={(ev) =>
                          reassign.mutate({
                            kind: e.kind as "tarefa" | "cadencia",
                            refId: e.refId,
                            ownerId: ev.target.value || null,
                          })
                        }
                        className="h-7 rounded-md border bg-background px-1 text-xs"
                        title="Reatribuir"
                      >
                        <option value="">Sem responsável</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      e.ownerName
                    )}
                  </td>
                  <td className="py-2 pr-3">{fmt(e.dueAt)}</td>
                  <td className="py-2 pr-3 font-semibold text-red-500">{e.daysLate}d</td>
                  <td className="py-2 pr-3">
                    <span className={e.acted ? "text-muted-foreground" : "text-amber-600"}>
                      {ESCALATION_REASON_LABEL[e.reason]}
                    </span>
                  </td>
                  {!compact && (
                    <td className="py-2 pr-0 text-right">
                      {e.acknowledgedAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => ack.mutate({ kind: e.kind, refId: e.refId, undo: true })}
                        >
                          <Undo2 className="mr-1 h-3.5 w-3.5" /> Reabrir
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          title="Ciência: some da lista até voltar a escalar"
                          onClick={() => ack.mutate({ kind: e.kind, refId: e.refId })}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Ciência
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {compact && items.length > list.length && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              + {items.length - list.length} no dashboard
            </p>
          )}
        </div>
      )}
      {!compact && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <UserRoundCog className="h-3 w-3" /> Trocar o responsável na coluna reatribui a
          tarefa/ação; próximo passo de reunião e alerta seguem o responsável da empresa.
        </p>
      )}
    </Card>
  );
}
