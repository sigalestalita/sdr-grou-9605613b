import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  addCsRecord,
  addCsTag,
  deleteCsContact,
  getCsClient,
  moveCsStage,
  removeCsTag,
  saveCsClient,
  saveCsContact,
  setCsOwner,
} from "@/lib/cs.functions";
import {
  CS_AGENDA_TYPE_LABEL,
  CS_CONTACT_MODULES,
  CS_CONTACT_MODULE_LABEL,
  CS_CONTACT_ORIGIN_LABEL,
  CS_ORIGIN_LABEL,
  CS_SIGNAL_CLASS,
  CS_SIGNAL_LABEL,
  CS_STAGES,
  CS_STAGE_LABEL,
  analyzeSignalTrend,
  healthLabel,
  type CsSignal,
} from "@/lib/cs-types";
import { SignalStrip } from "./signal-strip";
import { Plus, Trash2, X, Building2, Users, Tag as TagIcon, History, StickyNote } from "lucide-react";

const TREND_LABEL: Record<string, string> = {
  critico: "crítica (vermelho persistente)",
  queda: "queda de engajamento",
  oportunidade: "oportunidade (verde persistente)",
  estavel: "estável",
};

const TABS = ["visao", "contatos", "tags", "timeline", "registros"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  visao: "Visão geral",
  contatos: "Contatos",
  tags: "Tags",
  timeline: "Timeline",
  registros: "Registros",
};

export function CsClientModal({
  clientUid,
  onClose,
}: {
  clientUid: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("visao");
  const getFn = useServerFn(getCsClient);
  const stageFn = useServerFn(moveCsStage);
  const ownerFn = useServerFn(setCsOwner);
  const tagFn = useServerFn(addCsTag);
  const untagFn = useServerFn(removeCsTag);
  const recordFn = useServerFn(addCsRecord);
  const contactFn = useServerFn(saveCsContact);
  const delContactFn = useServerFn(deleteCsContact);
  const clientFn = useServerFn(saveCsClient);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cs-client", clientUid],
    queryFn: () => getFn({ data: { clientUid } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-board"] });
  };

  const mut = <T,>(fn: (v: T) => Promise<unknown>, msg: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(msg);
        invalidate();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
    });

  const stage = mut((s: string) => stageFn({ data: { clientUid, stage: s as never } }), "Etapa atualizada");
  const owner = mut(
    (v: { field: "cs_responsavel_id" | "comercial_responsavel_id"; userId: string | null }) =>
      ownerFn({ data: { clientUid, ...v } }),
    "Responsável atualizado",
  );
  const addTag = mut((t: string) => tagFn({ data: { clientUid, tag: t } }), "Tag adicionada");
  const rmTag = mut((id: string) => untagFn({ data: { id } }), "Tag removida");
  const addRecord = mut(
    (v: { tipo: string; content: string }) => recordFn({ data: { clientUid, ...v } }),
    "Registro salvo",
  );
  const saveContact = mut(
    (v: Record<string, unknown>) =>
      contactFn({ data: { ...v, client_uid: clientUid } as never }),
    "Contato salvo",
  );
  const delContact = mut((id: string) => delContactFn({ data: { id } }), "Contato removido");
  const saveClient = mut(
    (v: Record<string, unknown>) => clientFn({ data: { ...v, clientUid } as never }),
    "Cliente atualizado",
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const profileName = useMemo(() => {
    const map = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    return (id: string | null | undefined) => (id ? map.get(id) ?? "—" : "—");
  }, [data?.profiles]);

  if (typeof document === "undefined") return null;

  const client = data?.client;
  const health = client ? healthLabel(client.health_score ?? 0) : null;
  const history = (data?.weeks ?? []).map(
    (w) => ((data?.snapshots ?? []).find((s) => s.week_start === w)?.signal ?? "sem_dado") as CsSignal,
  );
  const trend = analyzeSignalTrend(history);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] bg-background/90 backdrop-blur-md overflow-y-auto p-4"
      onClick={onClose}
    >
      <div className="mx-auto w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <Card className="bg-popover border shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-bold truncate">{client?.nome_empresa ?? "Cliente"}</h2>
                <Badge variant="outline" className="font-mono text-[10px]">{clientUid}</Badge>
                {client && (
                  <Badge className={`text-[10px] ${CS_SIGNAL_CLASS[client.current_signal ?? "sem_dado"]}`}>
                    {CS_SIGNAL_LABEL[client.current_signal ?? "sem_dado"]}
                  </Badge>
                )}
                {health && <Badge className={`text-[10px] ${health.cls}`}>{health.label} · {client?.health_score ?? 0}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {CS_STAGE_LABEL[(client?.journey_stage ?? "onboarding") as never]} ·{" "}
                {CS_ORIGIN_LABEL[client?.origem ?? ""] ?? client?.origem} · CS: {profileName(client?.cs_responsavel_id)} ·
                Comercial: {profileName(client?.comercial_responsavel_id)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="flex gap-1 border-b px-3 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap ${
                  tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando cliente…</p>}

            {!isLoading && tab === "visao" && client && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Sinaleira PDA — últimas 8 semanas
                  </p>
                  <SignalStrip history={history} weeks={data?.weeks ?? []} size="lg" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tendência: {TREND_LABEL[trend.kind]}
                    {client.pda_consumo_pct != null && ` · consumo ${Math.round((client.pda_consumo_pct ?? 0) * 100)}%`}
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Info label="Aporte" value={`R$ ${Number(client.aporte_valor ?? 0).toLocaleString("pt-BR")}`} />
                  <Info label="Início contrato" value={fmtDate(client.data_inicio_contrato)} />
                  <Info label="Renovação" value={fmtDate(client.data_renovacao)} />
                  <Info label="Último contato" value={fmtDate(client.last_contact_at)} />
                  <Info label="Tipo" value={client.tipo_lead === "consultoria" ? "Consultoria" : "Empresa"} />
                  <Info label="Login PDA" value={client.login_pda || "—"} />
                  <Info label="DG ativo" value={client.dg_ativo ? "Sim" : "Não"} />
                  <Info label="Consultoria-mãe" value={client.parent_client_uid || "—"} />
                </div>

                {latestSheet && Object.keys(latestSheet).length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                      Dados da planilha (sinaleira) — todas as colunas
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {Object.entries(latestSheet).map(([k, v]) => (
                        <Info key={k} label={k} value={String(v)} />
                      ))}
                    </div>
                  </div>
                )}



                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="Etapa da jornada">
                    <select
                      value={client.journey_stage ?? "onboarding"}
                      onChange={(e) => stage.mutate(e.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      {CS_STAGES.map((s) => (
                        <option key={s} value={s}>{CS_STAGE_LABEL[s]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Responsável CS">
                    <select
                      value={client.cs_responsavel_id ?? ""}
                      onChange={(e) => owner.mutate({ field: "cs_responsavel_id", userId: e.target.value || null })}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">—</option>
                      {(data?.profiles ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Responsável comercial">
                    <select
                      value={client.comercial_responsavel_id ?? ""}
                      onChange={(e) => owner.mutate({ field: "comercial_responsavel_id", userId: e.target.value || null })}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">—</option>
                      {(data?.profiles ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <ClientEditor
                  client={client}
                  pending={saveClient.isPending}
                  onSave={(v) => saveClient.mutate(v)}
                />

                {(data?.children ?? []).length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      Empresas atendidas por esta consultoria
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(data?.children ?? []).map((c) => (
                        <Badge key={c.client_uid} variant="secondary" className="text-[10px]">
                          {c.nome_empresa} · {CS_SIGNAL_LABEL[c.current_signal ?? "sem_dado"]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(data?.alerts ?? []).filter((a) => a.status === "open").length > 0 && (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                    {(data?.alerts ?? [])
                      .filter((a) => a.status === "open")
                      .map((a) => (
                        <p key={a.id}>{a.reason}</p>
                      ))}
                  </div>
                )}
              </div>
            )}

            {!isLoading && tab === "contatos" && (
              <ContactsTab
                contacts={data?.contacts ?? []}
                pending={saveContact.isPending}
                onSave={(v) => saveContact.mutate(v as never)}
                onDelete={(id) => delContact.mutate(id)}
              />
            )}

            {!isLoading && tab === "tags" && (
              <TagsTab
                tags={data?.tags ?? []}
                pending={addTag.isPending}
                onAdd={(t) => addTag.mutate(t)}
                onRemove={(id) => rmTag.mutate(id)}
              />
            )}

            {!isLoading && tab === "timeline" && (
              <div className="space-y-2">
                {(data?.timeline ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
                )}
                <ol className="relative border-l pl-4 space-y-3">
                  {(data?.timeline ?? []).map((ev) => (
                    <li key={ev.id} className="text-xs">
                      <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                      <p className="font-medium text-foreground flex items-center gap-2">
                        <History className="h-3 w-3" /> {ev.title}
                        <span className="text-muted-foreground font-normal">
                          {format(new Date(ev.occurred_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                      </p>
                      {ev.description && <p className="text-muted-foreground whitespace-pre-wrap">{ev.description}</p>}
                      <p className="text-muted-foreground">
                        {ev.channel ? `${ev.channel} · ` : ""}{profileName(ev.author_id)}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {!isLoading && tab === "registros" && (
              <RecordsTab
                records={data?.records ?? []}
                authorName={profileName}
                pending={addRecord.isPending}
                onAdd={(v) => addRecord.mutate(v)}
              />
            )}
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yy", { locale: ptBR });
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
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

function ClientEditor({
  client,
  pending,
  onSave,
}: {
  client: Record<string, unknown> & { nome_empresa: string };
  pending: boolean;
  onSave: (v: Record<string, unknown>) => void;
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
  });
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-xs font-semibold">Dados cadastrais</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Empresa"><Input value={form.nome_empresa} onChange={(e) => set("nome_empresa", e.target.value)} /></Field>
        <Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} /></Field>
        <Field label="Login PDA"><Input value={form.login_pda} onChange={(e) => set("login_pda", e.target.value)} /></Field>
        <Field label="Site"><Input value={form.site_url} onChange={(e) => set("site_url", e.target.value)} /></Field>
        <Field label="LinkedIn"><Input value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} /></Field>
        <Field label="Setor"><Input value={form.setor} onChange={(e) => set("setor", e.target.value)} /></Field>
        <Field label="Aporte (R$)">
          <Input type="number" value={form.aporte_valor} onChange={(e) => set("aporte_valor", Number(e.target.value))} />
        </Field>
        <Field label="Início contrato">
          <Input type="date" value={form.data_inicio_contrato} onChange={(e) => set("data_inicio_contrato", e.target.value)} />
        </Field>
        <Field label="Renovação">
          <Input type="date" value={form.data_renovacao} onChange={(e) => set("data_renovacao", e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={form.dg_ativo} onChange={(e) => set("dg_ativo", e.target.checked)} />
        Diagnóstico de gestão (DG) ativo
      </label>
      <div className="flex justify-end">
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
            })
          }
        >
          {pending ? "Salvando…" : "Salvar dados"}
        </Button>
      </div>
    </div>
  );
}

function ContactsTab({
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
  const empty = { nome: "", email: "", whatsapp: "", cargo: "", modulos_vinculados: [] as string[] };
  const [form, setForm] = useState(empty);
  const toggleModule = (m: string) =>
    setForm((f) => ({
      ...f,
      modulos_vinculados: f.modulos_vinculados.includes(m)
        ? f.modulos_vinculados.filter((x) => x !== m)
        : [...f.modulos_vinculados, m],
    }));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {contacts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>}
        {contacts.map((c) => (
          <div key={c.id} className="rounded-lg border p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> {c.nome}
                {c.ativo_no_cliente === false && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">
                {[c.cargo, c.email, c.whatsapp].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {((c.modulos_vinculados as string[]) ?? []).map((m) => (
                  <Badge key={m} variant="secondary" className="text-[10px]">{CS_CONTACT_MODULE_LABEL[m] ?? m}</Badge>
                ))}
                <Badge variant="outline" className="text-[10px]">
                  {CS_CONTACT_ORIGIN_LABEL[(c.origem_detecao as string) ?? "manual"]}
                </Badge>
              </div>
            </div>
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(c.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <p className="text-xs font-semibold">Novo contato</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nome"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="Cargo"><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></Field>
          <Field label="E-mail"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-1">
          {CS_CONTACT_MODULES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleModule(m)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                form.modulos_vinculados.includes(m) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              }`}
            >
              {CS_CONTACT_MODULE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
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
              });
              setForm(empty);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar contato
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagsTab({
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag acumulada.</p>}
        {tags.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
            <TagIcon className="h-3 w-3" />
            {CS_AGENDA_TYPE_LABEL[t.tag] ?? t.tag}
            <span className="text-muted-foreground">{fmtDate(t.data_criacao)}</span>
            <button type="button" onClick={() => onRemove(t.id)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="ppa, pdi, ninebox…" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button
          size="sm"
          disabled={pending || !value.trim()}
          onClick={() => {
            onAdd(value.trim());
            setValue("");
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tags são cumulativas: nunca substituem as anteriores, para preservar o histórico de serviços entregues.
      </p>
    </div>
  );
}

function RecordsTab({
  records,
  authorName,
  pending,
  onAdd,
}: {
  records: Array<{ id: string; tipo: string; content: string; created_at: string; author_id: string | null }>;
  authorName: (id: string | null | undefined) => string;
  pending: boolean;
  onAdd: (v: { tipo: string; content: string }) => void;
}) {
  const [tipo, setTipo] = useState("nota");
  const [content, setContent] = useState("");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {records.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro qualitativo.</p>}
        {records.map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <StickyNote className="h-3 w-3" /> {r.tipo} · {fmtDate(r.created_at)} · {authorName(r.author_id)}
            </p>
            <p className="text-sm whitespace-pre-wrap mt-1">{r.content}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="nota">Nota</option>
              <option value="risco">Risco</option>
              <option value="oportunidade">Oportunidade</option>
              <option value="feedback">Feedback</option>
            </select>
          </Field>
        </div>
        <Textarea rows={3} placeholder="Contexto, percepções do time, riscos…" value={content} onChange={(e) => setContent(e.target.value)} />
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
    </div>
  );
}
