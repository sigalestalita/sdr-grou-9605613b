import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MeetingInviteDialog } from "@/components/leads/meeting-invite-dialog";
import { getExecutivoAvailability } from "@/lib/meeting-invite.functions";

/*
 * Reunião do lead na página do lead: o mesmo que o card "Agendado" do kanban
 * faz — data da reunião, quando ela foi marcada (carimbo automático do banco
 * ao definir a data), executivo que vai fazer a reunião, agenda dele no dia e
 * envio do convite com a passada de bastão.
 */

type LeadDaReuniao = {
  id: string;
  name: string | null;
  email: string | null;
  company_name: string | null;
  meeting_at: string | null;
  meeting_booked_at: string | null;
  meeting_duration_min?: number | null;
  meeting_invite_sent_at: string | null;
  executivo_id: string | null;
  converted_at?: string | null;
  created_at?: string | null;
};

const paraInputLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ReuniaoDoLead({
  lead,
  executivos,
  salvando,
  avisoEtapa,
  onUpdate,
}: {
  lead: LeadDaReuniao;
  executivos: { id: string; nome: string }[];
  salvando: boolean;
  /** Aviso mostrado sob a data quando salvar a reunião também muda a etapa. */
  avisoEtapa?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const meetingAt = lead.meeting_at ? new Date(lead.meeting_at) : null;
  const bookedAt = lead.meeting_booked_at ? new Date(lead.meeting_booked_at) : null;
  const convertedAt = lead.converted_at
    ? new Date(lead.converted_at)
    : lead.created_at
      ? new Date(lead.created_at)
      : null;
  const inviteSentAt = lead.meeting_invite_sent_at ? new Date(lead.meeting_invite_sent_at) : null;

  const [draft, setDraft] = useState(meetingAt ? paraInputLocal(meetingAt) : "");
  useEffect(() => {
    setDraft(lead.meeting_at ? paraInputLocal(new Date(lead.meeting_at)) : "");
  }, [lead.meeting_at]);
  const [convite, setConvite] = useState(false);

  const availabilityFn = useServerFn(getExecutivoAvailability);
  const dia = meetingAt ? format(meetingAt, "yyyy-MM-dd") : null;
  const { data: agenda } = useQuery({
    queryKey: ["exec-availability", lead.executivo_id, dia, lead.meeting_at, lead.id],
    queryFn: () =>
      availabilityFn({
        data: {
          executivoId: lead.executivo_id!,
          day: dia!,
          leadId: lead.id,
          meetingAt: meetingAt!.toISOString(),
          ...(lead.meeting_duration_min ? { durationMin: lead.meeting_duration_min } : {}),
        },
      }),
    enabled: !!lead.executivo_id && !!dia,
    staleTime: 5 * 60_000,
  });

  const draftMudou = draft !== (meetingAt ? paraInputLocal(meetingAt) : "");
  const executivoAtual = executivos.find((e) => e.id === lead.executivo_id);

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" />
        Reunião com o executivo
      </h2>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="reuniao-data" className="text-[12px] text-muted-foreground">
            Data da reunião
          </label>
          <div className="flex gap-1.5">
            <Input
              id="reuniao-data"
              type="datetime-local"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9"
            />
            {draftMudou && draft && (
              <Button
                size="sm"
                className="h-9"
                disabled={salvando}
                onClick={() => onUpdate({ meeting_at: new Date(draft).toISOString() })}
              >
                Salvar
              </Button>
            )}
          </div>
          {meetingAt && (
            <p className="text-[12px] text-muted-foreground">
              {format(meetingAt, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
          {avisoEtapa && <p className="text-[12px] text-muted-foreground">{avisoEtapa}</p>}
        </div>

        <div className="space-y-1">
          <span className="text-[12px] text-muted-foreground">Agendamento feito em</span>
          <p className="flex h-9 items-center text-[14px] font-medium">
            {bookedAt ? format(bookedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {bookedAt && convertedAt && bookedAt >= convertedAt
              ? `${formatDistanceStrict(bookedAt, convertedAt, { locale: ptBR })} após a conversão`
              : "Registrado sozinho quando a data da reunião é definida"}
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="reuniao-executivo" className="text-[12px] text-muted-foreground">
            Executivo que faz a reunião
          </label>
          <select
            id="reuniao-executivo"
            value={lead.executivo_id ?? ""}
            disabled={salvando}
            onChange={(e) => onUpdate({ executivo_id: e.target.value || null })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-[14px]"
          >
            <option value="">A definir</option>
            {executivos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
            {lead.executivo_id && !executivoAtual && (
              <option value={lead.executivo_id}>Executivo fora da lista atual</option>
            )}
          </select>
          {lead.executivo_id && meetingAt && agenda && (
            <div className="space-y-1 text-[12px]">
              {!agenda.connected ? (
                <p className="text-muted-foreground">
                  Agenda do executivo não vinculada (Integrações).
                </p>
              ) : agenda.conflicts.length ? (
                <p className="text-warning">
                  Conflito: {agenda.conflicts[0].title ?? "compromisso"}{" "}
                  {format(new Date(agenda.conflicts[0].start), "HH:mm")}–
                  {format(new Date(agenda.conflicts[0].end), "HH:mm")}
                </p>
              ) : (
                <p className="text-success">Executivo livre nesse horário</p>
              )}
              {agenda.connected && agenda.conflicts.length > 0 && agenda.free.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">Livre:</span>
                  {agenda.free.slice(0, 6).map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      disabled={salvando}
                      className="rounded border border-border px-1.5 py-0.5 hover:bg-muted"
                      onClick={() => onUpdate({ meeting_at: iso })}
                    >
                      {format(new Date(iso), "HH:mm")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-[12px] text-muted-foreground">
          {inviteSentAt
            ? `Convite enviado em ${format(inviteSentAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
            : "Convite ainda não enviado"}
        </span>
        <Button
          size="sm"
          variant={inviteSentAt ? "outline" : "default"}
          disabled={!meetingAt || !lead.executivo_id}
          title={
            !meetingAt || !lead.executivo_id
              ? "Defina a data e o executivo primeiro"
              : "Enviar convite ao lead e ao executivo, com a passada de bastão"
          }
          onClick={() => setConvite(true)}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          {inviteSentAt ? "Reenviar convite" : "Enviar convite"}
        </Button>
      </div>

      {convite && (
        <MeetingInviteDialog
          lead={{
            id: lead.id,
            name: lead.name,
            email: lead.email,
            company_name: lead.company_name,
            meeting_at: lead.meeting_at,
            executivo_id: lead.executivo_id,
            meeting_invite_sent_at: lead.meeting_invite_sent_at,
          }}
          onClose={() => setConvite(false)}
        />
      )}
    </Card>
  );
}
