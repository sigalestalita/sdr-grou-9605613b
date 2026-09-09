import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  addCsRecord,
  addCsTag,
  addCsTimelineEntry,
  deleteCsContact,
  getCsClient,
  moveCsStage,
  removeCsTag,
  saveCsClient,
  saveCsContact,
  setCsOwner,
} from "@/lib/cs.functions";
import {
  CS_CLIENT_TYPE_LABEL,
  CS_ORIGIN_LABEL,
  CS_SIGNAL_CLASS,
  CS_SIGNAL_LABEL,
  CS_STAGES,
  CS_STAGE_LABEL,
  analyzeSignalTrend,
  healthLabel,
  type CsSignal,
} from "@/lib/cs-types";
import { SignalStrip } from "@/components/cs/signal-strip";
import { CsMeetingsTab } from "@/components/cs/cs-meetings-tab";
import { CsSalesTab } from "@/components/cs/cs-sales-tab";
import {
  ClientEditor,
  ContactsPanel,
  PropertyRow,
  RecordsPanel,
  TagsPanel,
  TREND_LABEL,
  UnifiedTimeline,
  fmtDate,
  type ManualChannel,
} from "@/components/cs/cs-client-sections";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  PhoneCall,
} from "lucide-react";

export const Route = createFileRoute("/_app/empresas/$uid")({
  component: CompanyPage,
});

const TABS = ["atividades", "reunioes", "vendas", "registros"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  atividades: "Atividades",
  reunioes: "Reuniões",
  vendas: "Vendas",
  registros: "Registros",
};

/**
 * Página da empresa no padrão de registro do HubSpot: propriedades à esquerda,
 * atividade no centro, associações à direita. Substitui o antigo modal do CS.
 */
function CompanyPage() {
  const { uid: clientUid } = useParams({ from: "/_app/empresas/$uid" });
  const [tab, setTab] = useState<Tab>("atividades");
  const [editing, setEditing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const getFn = useServerFn(getCsClient);
  const stageFn = useServerFn(moveCsStage);
  const ownerFn = useServerFn(setCsOwner);
  const tagFn = useServerFn(addCsTag);
  const untagFn = useServerFn(removeCsTag);
  const recordFn = useServerFn(addCsRecord);
  const entryFn = useServerFn(addCsTimelineEntry);
  const contactFn = useServerFn(saveCsContact);
  const delContactFn = useServerFn(deleteCsContact);
  const clientFn = useServerFn(saveCsClient);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cs-client", clientUid],
    queryFn: () => getFn({ data: { clientUid } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
    qc.invalidateQueries({ queryKey: ["cs-board"] });
  };

  const useMut = <T,>(fn: (v: T) => Promise<unknown>, msg: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(msg);
        invalidate();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
    });

  const stage = useMut(
    (s: string) => stageFn({ data: { clientUid, stage: s as never } }),
    "Etapa atualizada",
  );
  const owner = useMut(
    (v: { field: "cs_responsavel_id" | "comercial_responsavel_id"; userId: string | null }) =>
      ownerFn({ data: { clientUid, ...v } }),
    "Responsável atualizado",
  );
  const addTag = useMut((t: string) => tagFn({ data: { clientUid, tag: t } }), "Tag adicionada");
  const rmTag = useMut((id: string) => untagFn({ data: { id } }), "Tag removida");
  const addRecord = useMut(
    (v: { tipo: string; content: string }) => recordFn({ data: { clientUid, ...v } }),
    "Registro salvo",
  );
  const addEntry = useMut(
    (v: {
      channel: ManualChannel;
      title: string;
      description: string | null;
      occurredAt: string;
    }) => entryFn({ data: { clientUid, ...v, countsAsContact: true } }),
    "Contato registrado na timeline",
  );
  const saveContact = useMut(
    (v: Record<string, unknown>) => contactFn({ data: { ...v, client_uid: clientUid } as never }),
    "Contato salvo",
  );
  const delContact = useMut((id: string) => delContactFn({ data: { id } }), "Contato removido");
  const saveClient = useMutation({
    mutationFn: (v: Record<string, unknown>) => clientFn({ data: { ...v, clientUid } as never }),
    onSuccess: () => {
      toast.success("Cliente atualizado");
      setEditing(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const profileName = useMemo(() => {
    const map = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "—") : "—");
  }, [data?.profiles]);

  const client = data?.client;
  const health = client ? healthLabel(client.health_score ?? 0) : null;
  const history = (data?.weeks ?? []).map(
    (w) =>
      ((data?.snapshots ?? []).find((s) => s.week_start === w)?.signal ?? "sem_dado") as CsSignal,
  );
  const trend = analyzeSignalTrend(history);
  const openAlerts = (data?.alerts ?? []).filter((a) => a.status === "open");
  // Colunas cruas da última semana sincronizada da planilha.
  const latestSheet = (() => {
    const snaps = data?.snapshots ?? [];
    const last = snaps[snaps.length - 1] as { metadata?: unknown } | undefined;
    const meta = last?.metadata as Record<string, unknown> | undefined;
    const sheet = meta?.["sheet"];
    return sheet && typeof sheet === "object" ? (sheet as Record<string, unknown>) : null;
  })();

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando empresa…</p>;
  }
  if (isError || !client) {
    return (
      <div className="p-6">
        <Link
          to="/cs"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Empresas
        </Link>
        <p className="mt-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Empresa não encontrada."}
        </p>
      </div>
    );
  }

  const scoreTone =
    (client.health_score ?? 0) >= 70
      ? "bg-emerald-500"
      : (client.health_score ?? 0) >= 40
        ? "bg-amber-400"
        : "bg-red-500";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
      {/* Cabeçalho do registro */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/cs"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Empresas
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-4.5 w-4.5" strokeWidth={1.75} />
            </span>
            <h1 className="truncate text-xl font-semibold">{client.nome_empresa}</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              {client.client_uid}
            </Badge>
            <Badge
              className={`text-[10px] text-white ${CS_SIGNAL_CLASS[client.current_signal ?? "sem_dado"]}`}
            >
              {CS_SIGNAL_LABEL[client.current_signal ?? "sem_dado"]}
            </Badge>
            {health && (
              <Badge variant="outline" className={`text-[10px] ${health.cls}`}>
                {health.label} · {client.health_score ?? 0}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {CS_CLIENT_TYPE_LABEL[client.tipo_lead] ?? client.tipo_lead} ·{" "}
            {CS_ORIGIN_LABEL[client.origem] ?? client.origem} ·{" "}
            {CS_STAGE_LABEL[(client.journey_stage ?? "onboarding") as never]} · CS:{" "}
            {profileName(client.cs_responsavel_id)} · Comercial:{" "}
            {profileName(client.comercial_responsavel_id)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setTab("atividades");
              setComposerOpen(true);
            }}
          >
            <PhoneCall className="mr-1.5 h-3.5 w-3.5" /> Registrar contato
          </Button>
        </div>
      </div>

      {/* Três colunas: propriedades · atividade · associações */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        {/* Esquerda */}
        <div className="space-y-4">
          <Panel title="Saúde do cliente">
            <div className="flex items-baseline justify-between">
              <span className="metric-value text-2xl">{client.health_score ?? 0}</span>
              <span className={`text-xs font-medium ${health?.cls ?? ""}`}>{health?.label}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full ${scoreTone}`}
                style={{ width: `${Math.min(100, client.health_score ?? 0)}%` }}
              />
            </div>
            <p className="section-label mt-4 mb-1.5">Sinaleira PDA · 8 semanas</p>
            <SignalStrip history={history} weeks={data?.weeks ?? []} size="lg" />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Tendência: {TREND_LABEL[trend.kind]}
              {client.pda_consumo_pct != null &&
                ` · consumo ${Math.round((client.pda_consumo_pct ?? 0) * 100)}%`}
            </p>
          </Panel>

          <Panel
            title="Sobre esta empresa"
            action={
              !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
              )
            }
          >
            {editing ? (
              <ClientEditor
                client={client}
                pending={saveClient.isPending}
                onSave={(v) => saveClient.mutate(v)}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className="divide-y">
                <PropertyRow label="Etapa">
                  <select
                    value={client.journey_stage ?? "onboarding"}
                    onChange={(e) => stage.mutate(e.target.value)}
                    className="h-7 w-full rounded border bg-background px-1.5 text-[12px]"
                  >
                    {CS_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {CS_STAGE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </PropertyRow>
                <PropertyRow label="Responsável CS">
                  <OwnerSelect
                    value={client.cs_responsavel_id}
                    profiles={data?.profiles ?? []}
                    onChange={(userId) => owner.mutate({ field: "cs_responsavel_id", userId })}
                  />
                </PropertyRow>
                <PropertyRow label="Executivo">
                  <OwnerSelect
                    value={client.comercial_responsavel_id}
                    profiles={data?.profiles ?? []}
                    onChange={(userId) =>
                      owner.mutate({ field: "comercial_responsavel_id", userId })
                    }
                  />
                </PropertyRow>
                <PropertyRow label="Tipo">
                  {CS_CLIENT_TYPE_LABEL[client.tipo_lead] ?? client.tipo_lead}
                </PropertyRow>
                <PropertyRow label="Origem">
                  {CS_ORIGIN_LABEL[client.origem] ?? client.origem}
                </PropertyRow>
                <PropertyRow label="CNPJ">{client.cnpj || "—"}</PropertyRow>
                <PropertyRow label="Login PDA">{client.login_pda || "—"}</PropertyRow>
                <PropertyRow label="Setor">{client.setor || "—"}</PropertyRow>
                <PropertyRow label="Site">
                  {client.site_url ? (
                    <a
                      href={client.site_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {client.site_url.replace(/^https?:\/\//, "")}{" "}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "—"
                  )}
                </PropertyRow>
                <PropertyRow label="LinkedIn">
                  {client.linkedin_url ? (
                    <a
                      href={client.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      perfil <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "—"
                  )}
                </PropertyRow>
                <PropertyRow label="DG ativo">{client.dg_ativo ? "Sim" : "Não"}</PropertyRow>
                {client.parent_client_uid && (
                  <PropertyRow label="Consultoria-mãe">
                    <Link
                      to="/empresas/$uid"
                      params={{ uid: client.parent_client_uid }}
                      className="text-primary hover:underline"
                    >
                      {client.parent_client_uid}
                    </Link>
                  </PropertyRow>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Contrato">
            <div className="divide-y">
              <PropertyRow label="Aporte">
                R$ {Number(client.aporte_valor ?? 0).toLocaleString("pt-BR")}
              </PropertyRow>
              <PropertyRow label="Início">{fmtDate(client.data_inicio_contrato)}</PropertyRow>
              <PropertyRow label="Renovação">{fmtDate(client.data_renovacao)}</PropertyRow>
              <PropertyRow label="Último contato">{fmtDate(client.last_contact_at)}</PropertyRow>
              <PropertyRow label="Na etapa desde">{fmtDate(client.stage_entered_at)}</PropertyRow>
            </div>
          </Panel>

          {latestSheet && Object.keys(latestSheet).length > 0 && (
            <Panel
              title="Planilha da sinaleira"
              action={
                <button
                  type="button"
                  onClick={() => setSheetOpen((v) => !v)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {sheetOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              }
            >
              {sheetOpen ? (
                <div className="divide-y">
                  {Object.entries(latestSheet).map(([k, v]) => (
                    <PropertyRow key={k} label={k}>
                      {String(v)}
                    </PropertyRow>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  {Object.keys(latestSheet).length} colunas da última sincronização.
                </p>
              )}
            </Panel>
          )}
        </div>

        {/* Centro */}
        <div className="min-w-0 space-y-4">
          {openAlerts.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> {openAlerts.length} alerta(s)
                em aberto
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {openAlerts.map((a) => (
                  <li key={a.id}>{a.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="surface-panel">
            <div className="flex gap-1 overflow-x-auto border-b px-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium ${
                    tab === t
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "atividades" && (
                <UnifiedTimeline
                  timeline={data?.timeline ?? []}
                  emails={data?.emails ?? []}
                  agenda={data?.agenda ?? []}
                  whatsapp={data?.whatsapp ?? []}
                  records={data?.records ?? []}
                  authorName={profileName}
                  pending={addEntry.isPending}
                  onAddEntry={(v) => addEntry.mutate(v)}
                  composerOpen={composerOpen}
                  onComposerOpenChange={setComposerOpen}
                />
              )}
              {tab === "reunioes" && (
                <CsMeetingsTab clientUid={clientUid} authorName={profileName} />
              )}
              {tab === "vendas" && <CsSalesTab clientUid={clientUid} authorName={profileName} />}
              {tab === "registros" && (
                <RecordsPanel
                  records={data?.records ?? []}
                  authorName={profileName}
                  pending={addRecord.isPending}
                  onAdd={(v) => addRecord.mutate(v)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Direita */}
        <div className="space-y-4">
          <Panel title={`Contatos (${(data?.contacts ?? []).length})`}>
            <ContactsPanel
              contacts={data?.contacts ?? []}
              pending={saveContact.isPending}
              onSave={(v) => saveContact.mutate(v as never)}
              onDelete={(id) => delContact.mutate(id)}
            />
          </Panel>

          <Panel title={`Tags (${(data?.tags ?? []).length})`}>
            <TagsPanel
              tags={data?.tags ?? []}
              pending={addTag.isPending}
              onAdd={(t) => addTag.mutate(t)}
              onRemove={(id) => rmTag.mutate(id)}
            />
          </Panel>

          {(data?.children ?? []).length > 0 && (
            <Panel title={`Empresas atendidas (${(data?.children ?? []).length})`}>
              <div className="space-y-1">
                {(data?.children ?? []).map((c) => (
                  <Link
                    key={c.client_uid}
                    to="/empresas/$uid"
                    params={{ uid: c.client_uid }}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-muted"
                  >
                    <span className="truncate">{c.nome_empresa}</span>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${CS_SIGNAL_CLASS[c.current_signal ?? "sem_dado"]}`}
                    />
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={`Alertas (${(data?.alerts ?? []).length})`}>
            {(data?.alerts ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum alerta gerado.</p>
            ) : (
              <div className="space-y-1.5">
                {(data?.alerts ?? []).slice(0, 8).map((a) => (
                  <div key={a.id} className="rounded border px-2 py-1.5 text-[12px]">
                    <p className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{a.alert_type}</span>
                      <Badge
                        variant={a.status === "open" ? "default" : "outline"}
                        className="text-[10px]"
                      >
                        {a.status === "open" ? "aberto" : "resolvido"}
                      </Badge>
                    </p>
                    <p className="line-clamp-2 text-muted-foreground">{a.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function OwnerSelect({
  value,
  profiles,
  onChange,
}: {
  value: string | null | undefined;
  profiles: { id: string; full_name: string | null; email: string | null }[];
  onChange: (userId: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 w-full rounded border bg-background px-1.5 text-[12px]"
    >
      <option value="">—</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name || p.email}
        </option>
      ))}
    </select>
  );
}
