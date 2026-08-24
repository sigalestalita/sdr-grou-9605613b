import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCsMeeting,
  listCsMeetings,
  saveCsMeeting,
  saveCsMeetingCategory,
} from "@/lib/cs.functions";
import { CalendarPlus, Plus, Trash2, Video, Link2 } from "lucide-react";

const STATUS: { value: MeetingStatus; label: string }[] = [
  { value: "realizada", label: "Realizada" },
  { value: "agendada", label: "Agendada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "no_show", label: "No-show" },
];

type MeetingStatus = "realizada" | "agendada" | "cancelada" | "no_show";

const STATUS_CLASS: Record<MeetingStatus, string> = {
  realizada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  agendada: "border-primary/40 bg-primary/10 text-primary",
  cancelada: "border-destructive/40 bg-destructive/10 text-destructive",
  no_show: "border-amber-500/40 bg-amber-500/10 text-amber-600",
};

function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function CsMeetingsTab({
  clientUid,
  authorName,
}: {
  clientUid: string;
  authorName: (id: string | null | undefined) => string;
}) {
  const listFn = useServerFn(listCsMeetings);
  const saveFn = useServerFn(saveCsMeeting);
  const delFn = useServerFn(deleteCsMeeting);
  const catFn = useServerFn(saveCsMeetingCategory);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cs-meetings", clientUid],
    queryFn: () => listFn({ data: { clientUid } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-meetings", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
  };

  const [form, setForm] = useState(() => ({
    id: undefined as string | undefined,
    title: "",
    categoryId: "",
    occurredAt: nowLocal(),
    durationMinutes: "60",
    status: "realizada" as MeetingStatus,
    attendees: "",
    meetingUrl: "",
    summary: "",
    nextStep: "",
    nextStepAt: "",
  }));
  const [newCat, setNewCat] = useState("");
  const [openForm, setOpenForm] = useState(false);

  const categories = data?.categories ?? [];
  const catName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name] as const));
    return (id: string | null) => (id ? map.get(id) ?? "Sem categoria" : "Sem categoria");
  }, [categories]);

  const reset = () => {
    setForm({
      id: undefined,
      title: "",
      categoryId: "",
      occurredAt: nowLocal(),
      durationMinutes: "60",
      status: "realizada",
      attendees: "",
      meetingUrl: "",
      summary: "",
      nextStep: "",
      nextStepAt: "",
    });
    setOpenForm(false);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: form.id,
          clientUid,
          title: form.title.trim(),
          categoryId: form.categoryId || null,
          occurredAt: form.occurredAt,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
          status: form.status,
          attendees: form.attendees || null,
          meetingUrl: form.meetingUrl || null,
          summary: form.summary || null,
          nextStep: form.nextStep || null,
          nextStepAt: form.nextStepAt || null,
        },
      }),
    onSuccess: () => {
      toast.success("Reunião registrada");
      reset();
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar reunião"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Reunião removida");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const createCat = useMutation({
    mutationFn: () => catFn({ data: { name: newCat.trim() } }),
    onSuccess: () => {
      toast.success("Categoria criada");
      setNewCat("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Registre cada reunião feita com o cliente e sua categoria. Reuniões sincronizadas do
          Calendly aparecerão aqui automaticamente no futuro.
        </p>
        <Button size="sm" onClick={() => setOpenForm((v) => !v)}>
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Nova reunião
        </Button>
      </div>

      {openForm && (
        <Card className="space-y-2 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Título da reunião"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Categoria…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                min={5}
                step={5}
                placeholder="Duração (min)"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as MeetingStatus })}
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              placeholder="Participantes (nomes/e-mails)"
              value={form.attendees}
              onChange={(e) => setForm({ ...form, attendees: e.target.value })}
            />
            <Input
              placeholder="Link da reunião (Meet, Zoom…)"
              value={form.meetingUrl}
              onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
            />
          </div>
          <Textarea
            rows={3}
            placeholder="Resumo / pauta / decisões"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Próximo passo"
              value={form.nextStep}
              onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
            />
            <Input
              type="datetime-local"
              value={form.nextStepAt}
              onChange={(e) => setForm({ ...form, nextStepAt: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Input
                className="h-8 w-48"
                placeholder="Nova categoria"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={newCat.trim().length < 2 || createCat.isPending}
                onClick={() => createCat.mutate()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={reset}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={form.title.trim().length < 2 || save.isPending}
                onClick={() => save.mutate()}
              >
                Salvar reunião
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando reuniões…</p>
      ) : (data?.meetings ?? []).length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma reunião registrada para este cliente.
        </Card>
      ) : (
        <div className="space-y-2">
          {(data?.meetings ?? []).map((m) => (
            <Card key={m.id} className="space-y-1 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Video className="h-3.5 w-3.5 text-primary" /> {m.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.occurred_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    {m.duration_minutes ? ` · ${m.duration_minutes} min` : ""} ·{" "}
                    {authorName(m.owner_user_id)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">{catName(m.category_id)}</Badge>
                  <Badge
                    variant="outline"
                    className={STATUS_CLASS[(m.status as MeetingStatus) ?? "realizada"]}
                  >
                    {STATUS.find((s) => s.value === m.status)?.label ?? m.status}
                  </Badge>
                  <button
                    onClick={() => remove.mutate(m.id)}
                    title="Remover reunião"
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {m.attendees && (
                <p className="text-xs text-muted-foreground">Participantes: {m.attendees}</p>
              )}
              {m.summary && <p className="whitespace-pre-wrap text-xs">{m.summary}</p>}
              {m.next_step && (
                <p className="text-xs text-muted-foreground">
                  Próximo passo: <span className="text-foreground">{m.next_step}</span>
                  {m.next_step_at
                    ? ` · ${format(new Date(m.next_step_at), "dd/MM/yy HH:mm", { locale: ptBR })}`
                    : ""}
                </p>
              )}
              {m.meeting_url && (
                <a
                  href={m.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  <Link2 className="h-3 w-3" /> Abrir link
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
