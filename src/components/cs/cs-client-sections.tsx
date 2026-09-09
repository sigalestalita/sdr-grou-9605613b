import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CS_AGENDA_TYPE_LABEL,
  CS_CONTACT_MODULES,
  CS_CONTACT_MODULE_LABEL,
  CS_CONTACT_ORIGIN_LABEL,
  CS_SERVICE_TYPES,
  CS_SERVICE_TYPE_LABEL,
  CS_TAG_USO,
  CS_TAG_USO_LABEL,
} from "@/lib/cs-types";
import {
  History,
  PhoneCall,
  Plus,
  StickyNote,
  Tag as TagIcon,
  Trash2,
  Users,
  X,
} from "lucide-react";

/*
 * Painéis reutilizáveis da página da empresa (CS). Extraídos do antigo modal
 * para que a página de registro em três colunas e qualquer outro contexto
 * (drawer, side panel) compartilhem o mesmo comportamento.
 */

export const TREND_LABEL: Record<string, string> = {
  critico: "crítica (vermelho persistente)",
  queda: "queda de engajamento",
  oportunidade: "oportunidade (verde persistente)",
  estavel: "estável",
};

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yy", { locale: ptBR });
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Linha "propriedade: valor" no painel lateral, no padrão de card de registro. */
export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,116px)_1fr] items-baseline gap-2 py-1.5 text-[13px]">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground">{children}</span>
    </div>
  );
}

export function ClientEditor({
  client,
  pending,
  onSave,
  onCancel,
}: {
  client: Record<string, unknown> & { nome_empresa: string };
  pending: boolean;
  onSave: (v: Record<string, unknown>) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    nome_empresa: client.nome_empresa,
    cnpj: (client.cnpj as string) ?? "",
    login_pda: (client.login_pda as string) ?? "",
    site_url: (client.site_url as string) ?? "",
    linkedin_url: (client.linkedin_url as string) ?? "",
    setor: (client.setor as string) ?? "",
    aporte_valor: Number(client.aporte_valor ?? 0),
    data_inicio_contrato: ((client.data_inicio_contrato as string) ?? "").slice(0, 10),
    data_renovacao: ((client.data_renovacao as string) ?? "").slice(0, 10),
    dg_ativo: Boolean(client.dg_ativo),
    tipo_servico: (client.tipo_servico as string) ?? "",
    tag_uso: (client.tag_uso as string) ?? "",
  });
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Empresa">
          <Input value={form.nome_empresa} onChange={(e) => set("nome_empresa", e.target.value)} />
        </Field>
        <Field label="CNPJ">
          <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} />
        </Field>
        <Field label="Login PDA">
          <Input value={form.login_pda} onChange={(e) => set("login_pda", e.target.value)} />
        </Field>
        <Field label="Setor">
          <Input value={form.setor} onChange={(e) => set("setor", e.target.value)} />
        </Field>
        <Field label="Serviço principal">
          <select
            value={form.tipo_servico}
            onChange={(e) => set("tipo_servico", e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {CS_SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CS_SERVICE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Uso do PDA (tag_uso)">
          <select
            value={form.tag_uso}
            onChange={(e) => set("tag_uso", e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {CS_TAG_USO.map((t) => (
              <option key={t} value={t}>
                {CS_TAG_USO_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Site">
          <Input value={form.site_url} onChange={(e) => set("site_url", e.target.value)} />
        </Field>
        <Field label="LinkedIn">
          <Input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} />
        </Field>
        <Field label="Aporte (R$)">
          <Input
            type="number"
            value={form.aporte_valor}
            onChange={(e) => set("aporte_valor", Number(e.target.value))}
          />
        </Field>
        <Field label="Início contrato">
          <Input
            type="date"
            value={form.data_inicio_contrato}
            onChange={(e) => set("data_inicio_contrato", e.target.value)}
          />
        </Field>
        <Field label="Renovação">
          <Input
            type="date"
            value={form.data_renovacao}
            onChange={(e) => set("data_renovacao", e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={form.dg_ativo}
          onChange={(e) => set("dg_ativo", e.target.checked)}
        />
        Diagnóstico de gestão (DG) ativo
      </label>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            onSave({
              ...client,
              ...form,
              cnpj: form.cnpj || null,
              login_pda: form.login_pda || null,
              site_url: form.site_url || null,
              linkedin_url: form.linkedin_url || null,
              setor: form.setor || null,
              data_inicio_contrato: form.data_inicio_contrato || null,
              data_renovacao: form.data_renovacao || null,
              tipo_servico: form.tipo_servico || null,
              tag_uso: form.tag_uso || null,
            })
          }
        >
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

export function ContactsPanel({
  contacts,
  pending,
  onSave,
  onDelete,
}: {
  contacts: Array<Record<string, unknown> & { id: string; nome: string }>;
  pending: boolean;
  onSave: (v: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const empty = {
    nome: "",
    email: "",
    whatsapp: "",
    cargo: "",
    modulos_vinculados: [] as string[],
    analista_pda: false,
  };
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const toggleModule = (m: string) =>
    setForm((f) => ({
      ...f,
      modulos_vinculados: f.modulos_vinculados.includes(m)
        ? f.modulos_vinculados.filter((x) => x !== m)
        : [...f.modulos_vinculados, m],
    }));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {contacts.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum contato cadastrado.</p>
        )}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{c.nome}</span>
                {c.analista_pda === true && <Badge className="text-[10px]">Analista PDA</Badge>}
                {c.ativo_no_cliente === false && (
                  <Badge variant="outline" className="text-[10px]">
                    inativo
                  </Badge>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {[c.cargo, c.email, c.whatsapp].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {((c.modulos_vinculados as string[]) ?? []).map((m) => (
                  <Badge key={m} variant="secondary" className="text-[10px]">
                    {CS_CONTACT_MODULE_LABEL[m] ?? m}
                  </Badge>
                ))}
                <Badge variant="outline" className="text-[10px]">
                  {CS_CONTACT_ORIGIN_LABEL[(c.origem_detecao as string) ?? "manual"]}
                </Badge>
              </div>
            </div>
            <button
              type="button"
              title="Remover contato"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(c.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {!adding ? (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar contato
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border p-2">
          <div className="grid gap-2">
            <Field label="Nome">
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Field>
            <Field label="Cargo">
              <Input
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              />
            </Field>
            <Field label="E-mail">
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={form.analista_pda}
              onChange={(e) => setForm({ ...form, analista_pda: e.target.checked })}
            />
            Analista PDA certificado
          </label>
          <div className="flex flex-wrap gap-1">
            {CS_CONTACT_MODULES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleModule(m)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  form.modulos_vinculados.includes(m)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {CS_CONTACT_MODULE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setForm(empty);
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={pending || !form.nome.trim()}
              onClick={() => {
                onSave({
                  nome: form.nome.trim(),
                  cargo: form.cargo || null,
                  email: form.email || null,
                  whatsapp: form.whatsapp || null,
                  modulos_vinculados: form.modulos_vinculados,
                  origem_detecao: "manual",
                  analista_pda: form.analista_pda,
                });
                setForm(empty);
                setAdding(false);
              }}
            >
              Salvar contato
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TagsPanel({
  tags,
  pending,
  onAdd,
  onRemove,
}: {
  tags: Array<{ id: string; tag: string; data_criacao: string; origem_agenda_id?: string | null }>;
  pending: boolean;
  onAdd: (t: string) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma tag acumulada.</p>
        )}
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
          >
            <TagIcon className="h-3 w-3" />
            {CS_AGENDA_TYPE_LABEL[t.tag] ?? t.tag}
            <span className="text-muted-foreground">{fmtDate(t.data_criacao)}</span>
            <button
              type="button"
              title="Remover tag"
              onClick={() => onRemove(t.id)}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="ppa, pdi, ninebox…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          size="sm"
          disabled={pending || !value.trim()}
          onClick={() => {
            onAdd(value.trim());
            setValue("");
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tags são cumulativas: nunca substituem as anteriores, para preservar o histórico de serviços
        entregues.
      </p>
    </div>
  );
}

export function RecordsPanel({
  records,
  authorName,
  pending,
  onAdd,
}: {
  records: Array<{
    id: string;
    tipo: string;
    content: string;
    created_at: string;
    author_id: string | null;
  }>;
  authorName: (id: string | null | undefined) => string;
  pending: boolean;
  onAdd: (v: { tipo: string; content: string }) => void;
}) {
  const [tipo, setTipo] = useState("nota");
  const [content, setContent] = useState("");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="nota">Nota</option>
              <option value="risco">Risco</option>
              <option value="oportunidade">Oportunidade</option>
              <option value="feedback">Feedback</option>
            </select>
          </Field>
        </div>
        <Textarea
          rows={3}
          placeholder="Contexto, percepções do time, riscos…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={pending || !content.trim()}
            onClick={() => {
              onAdd({ tipo, content: content.trim() });
              setContent("");
            }}
          >
            Salvar registro
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {records.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum registro qualitativo.</p>
        )}
        {records.map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <StickyNote className="h-3 w-3" /> {r.tipo} · {fmtDate(r.created_at)} ·{" "}
              {authorName(r.author_id)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{r.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type TlKind = "sistema" | "email" | "whatsapp" | "agenda" | "registro";

const TL_KIND_LABEL: Record<TlKind, string> = {
  sistema: "Sistema",
  email: "E-mail",
  whatsapp: "WhatsApp",
  agenda: "Agenda",
  registro: "Registro",
};

const TL_KIND_CLASS: Record<TlKind, string> = {
  sistema: "bg-primary",
  email: "bg-sky-500",
  whatsapp: "bg-emerald-500",
  agenda: "bg-violet-500",
  registro: "bg-amber-500",
};

type TlItem = {
  id: string;
  kind: TlKind;
  at: string;
  title: string;
  description?: string | null;
  meta?: string | null;
};

export type ManualChannel =
  | "ligacao"
  | "whatsapp"
  | "email"
  | "reuniao"
  | "presencial"
  | "observacao";

const MANUAL_CHANNEL_LABEL: Record<ManualChannel, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  reuniao: "Reunião",
  presencial: "Presencial",
  observacao: "Observação",
};

export type TimelineEmail = {
  id: string;
  direction: string;
  from_email: string | null;
  from_name: string | null;
  to_emails?: string[] | null;
  cc_emails?: string[] | null;
  subject: string | null;
  snippet: string | null;
  body_text?: string | null;
  received_at: string;
  owner_user_id: string | null;
};

export type TimelineWhatsapp = {
  id: string;
  body: string | null;
  sender_type: string;
  sender_user_id: string | null;
  message_type: string;
  created_at: string;
  phone?: string | null;
  contact_name?: string | null;
};

/** Timeline unificada do atendimento: sistema, e-mails, WhatsApp, agenda e registros. */
export function UnifiedTimeline({
  timeline,
  emails,
  agenda,
  whatsapp,
  records,
  authorName,
  pending,
  onAddEntry,
  composerOpen,
  onComposerOpenChange,
}: {
  timeline: {
    id: string;
    title: string;
    description: string | null;
    channel: string | null;
    occurred_at: string;
    author_id: string | null;
  }[];
  emails: TimelineEmail[];
  agenda: {
    id: string;
    name: string | null;
    status: string | null;
    start_time: string;
    invitee_name: string | null;
    invitee_email: string | null;
    user_id: string | null;
  }[];
  whatsapp: TimelineWhatsapp[];
  records: {
    id: string;
    tipo: string;
    content: string;
    created_at: string;
    author_id: string | null;
  }[];
  authorName: (id: string | null | undefined) => string;
  pending: boolean;
  onAddEntry: (v: {
    channel: ManualChannel;
    title: string;
    description: string | null;
    occurredAt: string;
  }) => void;
  /** Controle externo do formulário "Registrar contato" (ex.: botão no cabeçalho da página). */
  composerOpen?: boolean;
  onComposerOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = composerOpen ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onComposerOpenChange?.(v);
  };
  const [manual, setManual] = useState<{
    channel: ManualChannel;
    title: string;
    description: string;
    occurredAt: string;
  }>(() => ({
    channel: "ligacao",
    title: "",
    description: "",
    occurredAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  }));

  const [kinds, setKinds] = useState<TlKind[]>([]);
  const [view, setView] = useState<"tudo" | "whatsapp" | "email">("tudo");

  const items = useMemo<TlItem[]>(() => {
    const out: TlItem[] = [
      ...timeline.map((ev) => ({
        id: `tl-${ev.id}`,
        kind: "sistema" as TlKind,
        at: ev.occurred_at,
        title: ev.title,
        description: ev.description,
        meta: [ev.channel, authorName(ev.author_id)].filter(Boolean).join(" · "),
      })),
      ...emails.map((e) => ({
        id: `em-${e.id}`,
        kind: "email" as TlKind,
        at: e.received_at,
        title: e.subject || "(sem assunto)",
        description: e.snippet,
        meta: [
          e.direction === "outbound" ? "Enviado" : "Recebido",
          e.from_name || e.from_email,
          authorName(e.owner_user_id),
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      ...whatsapp.map((m) => ({
        id: `wa-${m.id}`,
        kind: "whatsapp" as TlKind,
        at: m.created_at,
        title:
          m.sender_type === "lead"
            ? "Mensagem do cliente"
            : m.sender_type === "ai"
              ? "Mensagem da IA"
              : "Mensagem enviada",
        description: m.body || `[${m.message_type}]`,
        meta: m.sender_user_id ? authorName(m.sender_user_id) : null,
      })),
      ...agenda.map((a) => ({
        id: `ag-${a.id}`,
        kind: "agenda" as TlKind,
        at: a.start_time,
        title: a.name || "Reunião agendada",
        description: [a.invitee_name, a.invitee_email].filter(Boolean).join(" · ") || null,
        meta: [a.status === "canceled" ? "Cancelada" : "Agendada", authorName(a.user_id)]
          .filter(Boolean)
          .join(" · "),
      })),
      ...records.map((r) => ({
        id: `rc-${r.id}`,
        kind: "registro" as TlKind,
        at: r.created_at,
        title: `Registro · ${r.tipo}`,
        description: r.content,
        meta: authorName(r.author_id),
      })),
    ];
    return out
      .filter((i) => !!i.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [timeline, emails, whatsapp, agenda, records, authorName]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);

  const visible = kinds.length === 0 ? items : items.filter((i) => kinds.includes(i.kind));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {(
          [
            ["tudo", `Tudo (${items.length})`],
            ["whatsapp", `WhatsApp (${whatsapp.length})`],
            ["email", `E-mails (${emails.length})`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-xs transition ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
        <Button
          size="sm"
          variant={open ? "ghost" : "default"}
          className="ml-auto"
          onClick={() => setOpen(!open)}
        >
          <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
          {open ? "Cancelar" : "Registrar contato"}
        </Button>
      </div>

      {open && (
        <Card className="space-y-2 p-3">
          <p className="text-xs text-muted-foreground">
            Registre contatos feitos fora do sistema (ligações, visitas, observações).
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={manual.channel}
              onChange={(e) => setManual({ ...manual, channel: e.target.value as ManualChannel })}
            >
              {(Object.keys(MANUAL_CHANNEL_LABEL) as ManualChannel[]).map((c) => (
                <option key={c} value={c}>
                  {MANUAL_CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
            <Input
              className="sm:col-span-2"
              placeholder="Resumo curto (ex.: Ligação para alinhar renovação)"
              value={manual.title}
              onChange={(e) => setManual({ ...manual, title: e.target.value })}
            />
          </div>
          <Textarea
            rows={3}
            placeholder="Detalhes do contato (opcional)"
            value={manual.description}
            onChange={(e) => setManual({ ...manual, description: e.target.value })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              type="datetime-local"
              className="w-56"
              value={manual.occurredAt}
              onChange={(e) => setManual({ ...manual, occurredAt: e.target.value })}
            />
            <Button
              size="sm"
              disabled={manual.title.trim().length < 3 || pending}
              onClick={() => {
                onAddEntry({
                  channel: manual.channel,
                  title: manual.title.trim(),
                  description: manual.description.trim() || null,
                  occurredAt: manual.occurredAt,
                });
                setManual({
                  channel: manual.channel,
                  title: "",
                  description: "",
                  occurredAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                });
                setOpen(false);
              }}
            >
              Salvar na timeline
            </Button>
          </div>
        </Card>
      )}

      {view === "whatsapp" ? (
        <WhatsAppThreadView whatsapp={whatsapp} authorName={authorName} />
      ) : view === "email" ? (
        <EmailThreadView emails={emails} authorName={authorName} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TL_KIND_LABEL) as TlKind[]).map((k) => {
              const active = kinds.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setKinds((prev) => (active ? prev.filter((v) => v !== k) : [...prev, k]))
                  }
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                    active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${TL_KIND_CLASS[k]}`} />
                  {TL_KIND_LABEL[k]}
                  <span className="text-muted-foreground">{counts[k] ?? 0}</span>
                </button>
              );
            })}
            {kinds.length > 0 && (
              <button
                type="button"
                onClick={() => setKinds([])}
                className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
              >
                Limpar
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {visible.map((i) => (
                <li key={i.id} className="text-xs">
                  <span
                    className={`absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full ${TL_KIND_CLASS[i.kind]}`}
                  />
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    <History className="h-3 w-3" /> {i.title}
                    <Badge variant="outline" className="text-[10px]">
                      {TL_KIND_LABEL[i.kind]}
                    </Badge>
                    <span className="font-normal text-muted-foreground">
                      {format(new Date(i.at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </p>
                  {i.description && (
                    <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">
                      {i.description}
                    </p>
                  )}
                  {i.meta && <p className="text-muted-foreground">{i.meta}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Conversa do WhatsApp com o cliente, em formato de chat por contato. */
function WhatsAppThreadView({
  whatsapp,
  authorName,
}: {
  whatsapp: TimelineWhatsapp[];
  authorName: (id: string | null | undefined) => string;
}) {
  const threads = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; phone: string | null; msgs: typeof whatsapp }
    >();
    for (const m of whatsapp) {
      const key = m.phone || "sem-numero";
      if (!map.has(key))
        map.set(key, {
          key,
          label: m.contact_name || m.phone || "Contato",
          phone: m.phone ?? null,
          msgs: [],
        });
      map.get(key)!.msgs.push(m);
    }
    return Array.from(map.values()).map((t) => ({
      ...t,
      msgs: [...t.msgs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    }));
  }, [whatsapp]);

  const [active, setActive] = useState<string | null>(null);
  const current = threads.find((t) => t.key === (active ?? threads[0]?.key));

  if (threads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma conversa de WhatsApp vinculada aos contatos deste cliente.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {threads.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {threads.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                current?.key === t.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted"
              }`}
            >
              {t.label} <span className="text-muted-foreground">{t.msgs.length}</span>
            </button>
          ))}
        </div>
      )}

      {current && (
        <Card className="space-y-2 bg-muted/30 p-3">
          <p className="text-xs font-medium">
            {current.label}
            {current.phone && (
              <span className="ml-2 font-normal text-muted-foreground">+{current.phone}</span>
            )}
          </p>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {current.msgs.map((m) => {
              const inbound = m.sender_type === "lead";
              return (
                <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-xs shadow-sm ${
                      inbound
                        ? "bg-background"
                        : m.sender_type === "ai"
                          ? "bg-violet-500/15"
                          : "bg-emerald-500/15"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-foreground">
                      {m.body || `[${m.message_type}]`}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {inbound
                        ? current.label
                        : m.sender_type === "ai"
                          ? "IA"
                          : authorName(m.sender_user_id)}
                      {" · "}
                      {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Trocas de e-mail com o cliente, com corpo expansível. */
function EmailThreadView({
  emails,
  authorName,
}: {
  emails: TimelineEmail[];
  authorName: (id: string | null | undefined) => string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = useMemo(
    () =>
      [...emails].sort(
        (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
      ),
    [emails],
  );

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum e-mail registrado para este cliente.</p>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((e) => {
        const outbound = e.direction === "outbound";
        const expanded = open === e.id;
        return (
          <Card key={e.id} className="p-3">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : e.id)}
              className="w-full text-left"
            >
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <Badge variant="outline" className="text-[10px]">
                  {outbound ? "Enviado" : "Recebido"}
                </Badge>
                {e.subject || "(sem assunto)"}
                <span className="font-normal text-muted-foreground">
                  {format(new Date(e.received_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {[
                  `De: ${e.from_name || e.from_email || "—"}`,
                  e.to_emails?.length ? `Para: ${e.to_emails.join(", ")}` : null,
                  e.cc_emails?.length ? `Cc: ${e.cc_emails.join(", ")}` : null,
                  authorName(e.owner_user_id),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </button>
            <p
              className={`mt-1 whitespace-pre-wrap text-xs text-muted-foreground ${expanded ? "" : "line-clamp-2"}`}
            >
              {expanded ? e.body_text || e.snippet || "" : e.snippet || e.body_text || ""}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
