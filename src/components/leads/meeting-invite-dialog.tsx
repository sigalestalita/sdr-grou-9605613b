import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarX2, Loader2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  cancelMeetingInvite,
  previewMeetingHandoff,
  sendMeetingInvite,
} from "@/lib/meeting-invite.functions";

/*
 * O SDR dispara daqui o convite da reunião (lead + executivo, com .ics) e o
 * briefing do executivo (reunião + passada de bastão). A passada de bastão
 * vem sugerida — BANT, observações e resumo da conversa — e o SDR ajusta.
 */
export function MeetingInviteDialog({
  lead,
  onClose,
  onSent,
}: {
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    company_name: string | null;
    meeting_at: string | null;
    executivo_id: string | null;
    meeting_invite_sent_at: string | null;
  };
  onClose: () => void;
  onSent?: () => void;
}) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewMeetingHandoff);
  const sendFn = useServerFn(sendMeetingInvite);
  const cancelFn = useServerFn(cancelMeetingInvite);

  const { data, isLoading } = useQuery({
    queryKey: ["meeting-handoff", lead.id],
    queryFn: () => previewFn({ data: { leadId: lead.id } }),
  });

  const [handoff, setHandoff] = useState("");
  const [duration, setDuration] = useState(45);
  const [leadEmail, setLeadEmail] = useState(lead.email ?? "");
  useEffect(() => {
    if (!data) return;
    setHandoff(data.current ?? data.handoff.suggested);
    setDuration(data.durationMin);
    if (!leadEmail && data.leadEmail) setLeadEmail(data.leadEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          leadId: lead.id,
          handoff,
          durationMin: duration,
          leadEmail: leadEmail.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.briefingSent
          ? `Convite ${r.isUpdate ? "atualizado" : "enviado"} e briefing entregue ao executivo`
          : `Convite enviado — o briefing falhou: ${r.briefingError ?? "erro"}`,
      );
      qc.invalidateQueries({ queryKey: ["kanban"] });
      onSent?.();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { leadId: lead.id } }),
    onSuccess: () => {
      toast.success("Cancelamento enviado ao lead e ao executivo");
      qc.invalidateQueries({ queryKey: ["kanban"] });
      onSent?.();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cancelar"),
  });

  const when = lead.meeting_at ? new Date(lead.meeting_at) : null;
  const emailOk = /^\S+@\S+\.\S+$/.test(leadEmail.trim());
  const ready = !!when && !!lead.executivo_id && emailOk && !!data?.executivo?.email;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
      onPointerDown={stop}
    >
      <Card
        className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={stop}
        onPointerDown={stop}
      >
        <div>
          <h2 className="text-base font-bold">
            {lead.meeting_invite_sent_at
              ? "Reenviar convite atualizado"
              : "Enviar convite da reunião"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lead.company_name ?? "Empresa"} · {lead.name ?? "lead"}
            {when
              ? ` · ${format(when, "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })}`
              : " · sem data"}
          </p>
        </div>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Montando a passada de bastão…
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-md border border-border p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Executivo</p>
                {data.executivo ? (
                  <>
                    <p className="font-medium">{data.executivo.name}</p>
                    <p className="text-muted-foreground">{data.executivo.email ?? "sem e-mail"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant={data.executivo.gcal ? "secondary" : "outline"}>
                        {data.executivo.gcal ? "Agenda vinculada" : "Agenda não vinculada"}
                      </Badge>
                      <Badge variant={data.executivo.meetingUrl ? "secondary" : "outline"}>
                        {data.executivo.meetingUrl ? "Link de reunião ok" : "Sem link fixo"}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <p className="text-amber-500">Escolha o executivo no card antes de enviar.</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">E-mail do lead</p>
                <Input
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="nome@empresa.com"
                  className="h-8 text-xs"
                />
                <label className="flex items-center gap-2 text-muted-foreground">
                  Duração
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="h-7 rounded border bg-background px-1 text-xs text-foreground"
                  >
                    {[30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  Passada de bastão (vai no e-mail do executivo)
                </p>
                {data.handoff.conversationSummary && (
                  <Badge variant="outline">resumo da conversa incluído</Badge>
                )}
              </div>
              <textarea
                value={handoff}
                onChange={(e) => setHandoff(e.target.value)}
                rows={9}
                className="w-full rounded-md border bg-background p-2 text-xs leading-relaxed"
              />
              <div className="flex flex-wrap gap-1">
                {data.handoff.bant.map((b) => (
                  <span
                    key={b.key}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px]"
                  >
                    {b.label.split(" ")[0]}: {b.status}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              O lead e o executivo recebem o convite com o arquivo de agenda (basta aceitar). O
              executivo recebe também este briefing, com você em cópia.
            </p>

            <div className="flex items-center justify-between gap-2 pt-1">
              {lead.meeting_invite_sent_at ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={cancel.isPending}
                  onClick={() =>
                    confirm("Enviar o cancelamento da reunião ao lead e ao executivo?") &&
                    cancel.mutate()
                  }
                >
                  <CalendarX2 className="mr-1 h-3.5 w-3.5" /> Cancelar reunião
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Fechar
                </Button>
                <Button size="sm" disabled={!ready || send.isPending} onClick={() => send.mutate()}>
                  {send.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-3.5 w-3.5" />
                  )}
                  {lead.meeting_invite_sent_at ? "Reenviar convite" : "Enviar convite"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
