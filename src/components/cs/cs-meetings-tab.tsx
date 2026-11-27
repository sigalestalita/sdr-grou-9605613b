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
import { opcoesDoClienteCs } from "@/lib/cs-agenda-reunioes.functions";
import { OfertasDeHorarios } from "@/components/cs/oferecer-horarios";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Link2,
  Pencil,
  Plus,
  Trash2,
  UserX,
  Video,
  X,
} from "lucide-react";

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

type Reuniao = {
  id: string;
  title: string;
  category_id: string | null;
  occurred_at: string;
  duration_minutes: number | null;
  status: string | null;
  attendees: string | null;
  meeting_url: string | null;
  summary: string | null;
  next_step: string | null;
  next_step_at: string | null;
  owner_user_id: string | null;
  contact_id?: string | null;
};

const paraLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

function agoraLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return paraLocal(d);
}

/** Próxima hora cheia: o padrão de um agendamento. */
function proximaHoraLocal() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return paraLocal(d);
}

type Form = {
  id: string | undefined;
  title: string;
  categoryId: string;
  occurredAt: string;
  durationMinutes: string;
  status: MeetingStatus;
  contactId: string;
  attendees: string;
  meetingUrl: string;
  summary: string;
  nextStep: string;
  nextStepAt: string;
};

const formVazio = (status: MeetingStatus): Form => ({
  id: undefined,
  title: "",
  categoryId: "",
  occurredAt: status === "agendada" ? proximaHoraLocal() : agoraLocal(),
  durationMinutes: "60",
  status,
  contactId: "",
  attendees: "",
  meetingUrl: "",
  summary: "",
  nextStep: "",
  nextStepAt: "",
});

/**
 * Reuniões do cliente. "Agendar reunião" reserva um horário (status
 * agendada), com a pessoa do cliente: pode haver várias no mesmo dia, e elas
 * aparecem na Agenda do CS. "Registrar reunião" é a que já aconteceu.
 */
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
  const opcoesFn = useServerFn(opcoesDoClienteCs);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cs-meetings", clientUid],
    queryFn: () => listFn({ data: { clientUid } }),
  });
  const { data: opcoes } = useQuery({
    queryKey: ["cs-opcoes-cliente", clientUid],
    queryFn: () => opcoesFn({ data: { clientUid } }),
    staleTime: 60_000,
  });
  const contatos = opcoes?.contatos ?? [];
  const nomeContato = (id: string | null | undefined) =>
    id ? (contatos.find((c) => c.id === id)?.nome ?? null) : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-meetings", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-agenda"] });
  };

  const [form, setForm] = useState<Form>(() => formVazio("realizada"));
  const [newCat, setNewCat] = useState("");
  const [openForm, setOpenForm] = useState(false);

  const categories = data?.categories ?? [];
  const catName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name] as const));
    return (id: string | null) => (id ? (map.get(id) ?? "Sem categoria") : "Sem categoria");
  }, [categories]);

  // Horário reservado de uma oferta aparece na seção da oferta, não aqui.
  const reunioes = ((data?.meetings ?? []) as unknown as Reuniao[]).filter(
    (m) => m.status !== "reservada",
  );
  const agora = Date.now();
  // Próximas: agendadas de hoje em diante, da mais próxima para a mais distante.
  const proximas = reunioes
    .filter((m) => m.status === "agendada" && Date.parse(m.occurred_at) >= agora - 12 * 3600_000)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const idsProximas = new Set(proximas.map((m) => m.id));
  const historico = reunioes.filter((m) => !idsProximas.has(m.id));

  // As outras reuniões do cliente no mesmo dia do formulário (várias por dia valem).
  const doMesmoDia = reunioes.filter(
    (m) =>
      m.id !== form.id &&
      m.status !== "cancelada" &&
      form.occurredAt &&
      m.occurred_at &&
      format(new Date(m.occurred_at), "yyyy-MM-dd") === form.occurredAt.slice(0, 10),
  );

  const abrir = (status: MeetingStatus) => {
    setForm(formVazio(status));
    setOpenForm(true);
  };
  const editar = (m: Reuniao) => {
    setForm({
      id: m.id,
      title: m.title,
      categoryId: m.category_id ?? "",
      occurredAt: paraLocal(new Date(m.occurred_at)),
      durationMinutes: m.duration_minutes ? String(m.duration_minutes) : "",
      status: (m.status as MeetingStatus) ?? "realizada",
      contactId: m.contact_id ?? "",
      attendees: m.attendees ?? "",
      meetingUrl: m.meeting_url ?? "",
      summary: m.summary ?? "",
      nextStep: m.next_step ?? "",
      nextStepAt: m.next_step_at ? paraLocal(new Date(m.next_step_at)) : "",
    });
    setOpenForm(true);
  };
  const reset = () => {
    setForm(formVazio("realizada"));
    setOpenForm(false);
  };

  const save = useMutation({
    mutationFn: (f: Form) =>
      saveFn({
        data: {
          id: f.id,
          clientUid,
          title: f.title.trim(),
          categoryId: f.categoryId,
          occurredAt: f.occurredAt,
          durationMinutes: f.durationMinutes ? Number(f.durationMinutes) : null,
          status: f.status,
          contactId: f.contactId || null,
          attendees: f.attendees || null,
          meetingUrl: f.meetingUrl || null,
          summary: f.summary || null,
          nextStep: f.nextStep || null,
          nextStepAt: f.nextStepAt || null,
        },
      }),
    onSuccess: (_r, f) => {
      toast.success(
        f.status === "agendada"
          ? "Reunião agendada"
          : f.id
            ? "Reunião atualizada"
            : "Reunião registrada",
      );
      reset();
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar reunião"),
  });

  /** Atalho na reunião agendada: marcar como realizada, no-show ou cancelada. */
  const mudarStatus = (m: Reuniao, status: MeetingStatus) => {
    if (!m.category_id) {
      editar(m);
      setForm((f) => ({ ...f, status }));
      toast.info("Escolha o tipo da reunião para salvar");
      return;
    }
    save.mutate({
      id: m.id,
      title: m.title,
      categoryId: m.category_id,
      occurredAt: paraLocal(new Date(m.occurred_at)),
      durationMinutes: m.duration_minutes ? String(m.duration_minutes) : "",
      status,
      contactId: m.contact_id ?? "",
      attendees: m.attendees ?? "",
      meetingUrl: m.meeting_url ?? "",
      summary: m.summary ?? "",
      nextStep: m.next_step ?? "",
      nextStepAt: m.next_step_at ? paraLocal(new Date(m.next_step_at)) : "",
    });
  };

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

  const agendando = form.status === "agendada";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Agende reuniões com as pessoas do cliente (quantas precisar no mesmo dia) e registre as
          que aconteceram. As agendadas aparecem na Agenda do CS.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => abrir("agendada")}>
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Agendar reunião
          </Button>
          <Button size="sm" variant="outline" onClick={() => abrir("realizada")}>
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Registrar reunião feita
          </Button>
        </div>
      </div>

      <OfertasDeHorarios
        clientUid={clientUid}
        contatos={contatos}
        tipos={categories}
        invalidar={invalidate}
      />

      {openForm && (
        <Card className="space-y-2 p-3">
          <p className="text-[12px] font-semibold">
            {form.id ? "Editar reunião" : agendando ? "Agendar reunião" : "Registrar reunião feita"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Título da reunião"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <select
              className={`h-9 rounded-md border bg-background px-2 text-sm ${
                form.categoryId ? "" : "border-amber-500/60"
              }`}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Tipo da reunião (obrigatório)…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={form.contactId}
              onChange={(e) => {
                const c = contatos.find((x) => x.id === e.target.value);
                setForm({
                  ...form,
                  contactId: e.target.value,
                  attendees:
                    form.attendees || !c
                      ? form.attendees
                      : [c.nome, c.email].filter(Boolean).join(" · "),
                });
              }}
              title="Com quem é a reunião"
            >
              <option value="">
                {contatos.length ? "Com quem (contato do cliente)…" : "Sem contatos cadastrados"}
              </option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.cargo ? ` · ${c.cargo}` : ""}
                </option>
              ))}
            </select>
            <Input
              placeholder="Outros participantes (nomes/e-mails)"
              value={form.attendees}
              onChange={(e) => setForm({ ...form, attendees: e.target.value })}
            />
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
              className="sm:col-span-2"
              placeholder="Link da reunião (Meet, Zoom…)"
              value={form.meetingUrl}
              onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
            />
          </div>
          {doMesmoDia.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Neste dia o cliente já tem:{" "}
              {doMesmoDia
                .map(
                  (m) =>
                    `${format(new Date(m.occurred_at), "HH:mm")} ${m.title}${
                      nomeContato(m.contact_id) ? ` (${nomeContato(m.contact_id)})` : ""
                    }`,
                )
                .join(" · ")}
            </p>
          )}
          <Textarea
            rows={3}
            placeholder={agendando ? "Pauta" : "Resumo / pauta / decisões"}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          {!agendando && (
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
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
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
                disabled={form.title.trim().length < 2 || !form.categoryId || save.isPending}
                onClick={() => save.mutate(form)}
              >
                {agendando && !form.id ? "Agendar" : "Salvar reunião"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando reuniões…</p>
      ) : reunioes.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma reunião registrada para este cliente.
        </Card>
      ) : (
        <div className="space-y-3">
          {proximas.length > 0 && (
            <div className="space-y-2">
              <p className="section-label">Próximas reuniões</p>
              {proximas.map((m) => (
                <CartaoReuniao
                  key={m.id}
                  m={m}
                  catName={catName}
                  authorName={authorName}
                  contato={nomeContato(m.contact_id)}
                  onEditar={() => editar(m)}
                  onRemover={() => remove.mutate(m.id)}
                  acoes={
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={save.isPending}
                        onClick={() => mudarStatus(m, "realizada")}
                      >
                        <Check className="mr-1 h-3 w-3" /> Realizada
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={save.isPending}
                        onClick={() => mudarStatus(m, "no_show")}
                      >
                        <UserX className="mr-1 h-3 w-3" /> No-show
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-destructive hover:text-destructive"
                        disabled={save.isPending}
                        onClick={() => mudarStatus(m, "cancelada")}
                      >
                        <X className="mr-1 h-3 w-3" /> Cancelar
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
          {historico.length > 0 && (
            <div className="space-y-2">
              {proximas.length > 0 && <p className="section-label">Histórico</p>}
              {historico.map((m) => (
                <CartaoReuniao
                  key={m.id}
                  m={m}
                  catName={catName}
                  authorName={authorName}
                  contato={nomeContato(m.contact_id)}
                  onEditar={() => editar(m)}
                  onRemover={() => remove.mutate(m.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CartaoReuniao({
  m,
  catName,
  authorName,
  contato,
  onEditar,
  onRemover,
  acoes,
}: {
  m: Reuniao;
  catName: (id: string | null) => string;
  authorName: (id: string | null | undefined) => string;
  contato: string | null;
  onEditar: () => void;
  onRemover: () => void;
  acoes?: React.ReactNode;
}) {
  return (
    <Card className="space-y-1 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Video className="h-3.5 w-3.5 text-primary" /> {m.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(m.occurred_at), "EEE dd/MM/yy HH:mm", { locale: ptBR })}
            {m.duration_minutes ? ` · ${m.duration_minutes} min` : ""}
            {contato ? ` · com ${contato}` : ""} · {authorName(m.owner_user_id)}
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
            onClick={onEditar}
            title="Editar reunião"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Remover a reunião “${m.title}”?`)) onRemover();
            }}
            title="Remover reunião"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {m.attendees && <p className="text-xs text-muted-foreground">Participantes: {m.attendees}</p>}
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
      {acoes}
    </Card>
  );
}
