import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/use-auth";

import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CsClientModal } from "@/components/cs/cs-client-modal";
import { CsClientCard } from "@/components/cs/cs-client-card";
import { CsAlertModal } from "@/components/cs/cs-alert-modal";
import { CsSettingsPanel } from "@/components/cs/cs-settings-panel";
import {
  listCsBoard,
  moveCsStage,
  runCsAlertScan,
  saveCsClient,
  syncCsSignal,
} from "@/lib/cs.functions";
import {
  CS_CLIENT_TYPES,
  CS_CLIENT_TYPE_LABEL,
  CS_ORIGINS,
  CS_ORIGIN_LABEL,
  CS_SIGNALS,
  CS_SIGNAL_LABEL,
  CS_STAGES,
  CS_STAGE_LABEL,
  type CsSignal,
} from "@/lib/cs-types";
import {
  Bell,
  HeartPulse,
  Plus,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";

export const Route = createFileRoute("/_app/cs")({
  component: CsPage,
  head: () => ({
    meta: [
      { title: "Customer Success | Lidi CRM" },
      {
        name: "description",
        content:
          "Gestão de carteira de Customer Success: jornada do cliente, sinaleira de engajamento PDA, health score e alertas de SLA.",
      },
      { property: "og:title", content: "Customer Success | Lidi CRM" },
      {
        property: "og:description",
        content: "Carteira de clientes, sinaleira de engajamento, health score e alertas de CS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ViewTab = "kanban" | "config";

function CsPage() {
  const boardFn = useServerFn(listCsBoard);
  const stageFn = useServerFn(moveCsStage);
  const scanFn = useServerFn(runCsAlertScan);
  const syncFn = useServerFn(syncCsSignal);
  const qc = useQueryClient();

  const [view, setView] = useState<ViewTab>("kanban");
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [q, setQ] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [fSignal, setFSignal] = useState("");
  const [fType, setFType] = useState("");
  const [fTag, setFTag] = useState("");

  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["cs-board", user?.id],
    queryFn: () => boardFn({}),
    enabled: !!user,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cs-board"] });


  const scan = useMutation({
    mutationFn: () => scanFn({}),
    onSuccess: (r) => {
      toast.success(`${r.created} alerta(s) gerado(s)`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: {} }),
    onSuccess: (r) => {
      if (r.ok)
        toast.success(
          `Sinaleira sincronizada (${r.tab}) — ${r.matched} cliente(s)` +
            (r.created ? `, ${r.created} novo(s) importado(s)` : ""),
        );
      else toast.error(r.error ?? "Falha na sincronização");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const move = useMutation({
    mutationFn: (v: { clientUid: string; stage: string }) =>
      stageFn({ data: { clientUid: v.clientUid, stage: v.stage as never } }),
    onSuccess: () => {
      toast.success("Etapa atualizada");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const weeks = data?.weeks ?? [];
  const historyOf = useMemo(() => {
    const map = new Map<string, Map<string, CsSignal>>();
    for (const s of data?.snapshots ?? []) {
      if (!map.has(s.client_uid)) map.set(s.client_uid, new Map());
      map.get(s.client_uid)!.set(s.week_start, s.signal as CsSignal);
    }
    return (uid: string) => weeks.map((w) => map.get(uid)?.get(w) ?? ("sem_dado" as CsSignal));
  }, [data?.snapshots, weeks]);

  /** Último snapshot de cada cliente: traz todas as colunas da planilha. */
  const sheetOf = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const s of data?.snapshots ?? []) {
      const meta = (s as { metadata?: unknown }).metadata;
      if (meta && typeof meta === "object") map.set(s.client_uid, meta as Record<string, unknown>);
    }
    return map;
  }, [data?.snapshots]);

  /** Campos que mudaram entre o penúltimo e o último snapshot sincronizado. */
  const changedOf = useMemo(() => {
    const prev = new Map<string, Record<string, unknown>>();
    const last = new Map<string, Record<string, unknown>>();
    for (const s of data?.snapshots ?? []) {
      const meta = (s as { metadata?: unknown }).metadata;
      if (!meta || typeof meta !== "object") continue;
      const cur = last.get(s.client_uid);
      if (cur) prev.set(s.client_uid, cur);
      last.set(s.client_uid, meta as Record<string, unknown>);
    }
    const out = new Map<string, Set<string>>();
    for (const [uid, cur] of last) {
      const before = prev.get(uid);
      if (!before) continue;
      const keys = new Set([...Object.keys(cur), ...Object.keys(before)]);
      const diff = new Set<string>();
      for (const k of keys) {
        if (k === "tab" || k === "sheet") continue;
        const a = cur[k] ?? "";
        const b = before[k] ?? "";
        if (String(a) !== String(b)) diff.add(k);
      }
      if (diff.size > 0) out.set(uid, diff);
    }
    return out;
  }, [data?.snapshots]);


  const alertsOf = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["alerts"]>();
    for (const a of data?.alerts ?? []) {
      const arr = map.get(a.client_uid) ?? [];
      arr.push(a);
      map.set(a.client_uid, arr);
    }
    return map;
  }, [data?.alerts]);

  const tagsOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of data?.tags ?? []) {
      map.set(t.client_uid, [...(map.get(t.client_uid) ?? []), t.tag]);
    }
    return map;
  }, [data?.tags]);

  const tagOptions = useMemo(
    () => Array.from(new Set((data?.tags ?? []).map((t) => t.tag))).sort(),
    [data?.tags],
  );

  const profileName = useMemo(() => {
    const map = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    return (id: string | null | undefined) => (id ? map.get(id) ?? "—" : "Sem responsável");
  }, [data?.profiles]);

  const clients = (data?.clients ?? []).filter((c) => {
    if (!c.ativo) return false;
    if (q && !`${c.nome_empresa} ${c.client_uid} ${c.cnpj ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (fOwner && c.cs_responsavel_id !== fOwner) return false;
    if (fSignal && c.current_signal !== fSignal) return false;
    if (fType && c.tipo_lead !== fType) return false;
    if (fTag && !(tagsOf.get(c.client_uid) ?? []).includes(fTag)) return false;
    return true;
  });

  const openAlerts = (data?.alerts ?? []).length;
  const avgHealth = clients.length
    ? Math.round(clients.reduce((a, c) => a + (c.health_score ?? 0), 0) / clients.length)
    : 0;
  const reds = clients.filter((c) => c.current_signal === "vermelho").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <HeartPulse className="h-5 w-5" /> Customer Success
          </h1>
          <p className="text-sm text-muted-foreground">
            Carteira, jornada do cliente, sinaleira de engajamento e alertas de SLA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} /> Sincronizar sinaleira
          </Button>
          <Button size="sm" variant="outline" disabled={scan.isPending} onClick={() => scan.mutate()}>
            <Bell className="h-4 w-4 mr-1" /> Gerar alertas
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo cliente
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(["kanban", "config"] as ViewTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setView(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              view === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "kanban" ? "Jornada" : "Configurações"}
          </button>
        ))}
      </div>

      {view === "config" ? (
        <CsSettingsPanel
          profiles={data?.profiles ?? []}
          weights={data?.weights}
          sla={data?.sla}
          routing={data?.routing}
          onSaved={invalidate}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Clientes ativos" value={String(clients.length)} />
            <Kpi label="Health médio" value={`${avgHealth}`} />
            <Kpi label="Sinaleira vermelha" value={String(reds)} alert={reds > 0} />
            <Kpi label="Alertas abertos" value={String(openAlerts)} alert={openAlerts > 0} />
          </div>

          <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar empresa ou código" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">Todos os CS</option>
              {(data?.profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
            <select value={fSignal} onChange={(e) => setFSignal(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">Toda sinaleira</option>
              {CS_SIGNALS.map((s) => (
                <option key={s} value={s}>{CS_SIGNAL_LABEL[s]}</option>
              ))}
            </select>
            <select value={fType} onChange={(e) => setFType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">Empresa e consultoria</option>
              {CS_CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>{CS_CLIENT_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <select value={fTag} onChange={(e) => setFTag(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">Todas as tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Card>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando carteira…</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {CS_STAGES.map((stage) => {
                const col = clients.filter((c) => c.journey_stage === stage);
                return (
                  <div key={stage} className="rounded-xl border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{CS_STAGE_LABEL[stage]}</p>
                      <Badge variant="secondary" className="text-[10px]">{col.length}</Badge>
                    </div>
                    {col.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente nesta etapa.</p>}
                    {col.map((c) => (
                      <CsClientCard
                        key={c.client_uid}
                        client={c}
                        history={historyOf(c.client_uid)}
                        weeks={weeks}
                        ownerName={profileName(c.cs_responsavel_id)}
                        sheet={sheetOf.get(c.client_uid)}
                        changed={changedOf.get(c.client_uid)}
                        alerts={alertsOf.get(c.client_uid) ?? []}
                        tags={tagsOf.get(c.client_uid) ?? []}
                        slaDays={data?.sla?.[stage] ?? 0}
                        moveDisabled={move.isPending}
                        onOpen={setOpenClient}
                        onOpenAlert={setOpenAlert}
                        onMove={(uid, s) => move.mutate({ clientUid: uid, stage: s })}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {openClient && <CsClientModal clientUid={openClient} onClose={() => setOpenClient(null)} />}
      {openAlert && (
        <CsAlertModal
          alertId={openAlert}
          alert={(data?.alerts ?? []).find((a) => a.id === openAlert) ?? null}
          onClose={() => setOpenAlert(null)}
          onDone={invalidate}
        />
      )}
      {newOpen && (
        <NewClientModal
          profiles={data?.profiles ?? []}
          onClose={() => setNewOpen(false)}
          onCreated={(uid) => {
            setNewOpen(false);
            invalidate();
            setOpenClient(uid);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <Card className={`p-3 ${alert ? "border-amber-500/50 bg-amber-500/10" : ""}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </Card>
  );
}

function NewClientModal({
  profiles,
  onClose,
  onCreated,
}: {
  profiles: Array<{ id: string; full_name: string | null; email: string | null }>;
  onClose: () => void;
  onCreated: (uid: string) => void;
}) {
  const saveFn = useServerFn(saveCsClient);
  const [form, setForm] = useState({
    nome_empresa: "",
    cnpj: "",
    tipo_lead: "empresa",
    origem: "marketing",
    aporte_valor: 0,
    login_pda: "",
    data_inicio_contrato: "",
    data_renovacao: "",
    cs_responsavel_id: "",
    comercial_responsavel_id: "",
  });

  const create = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          nome_empresa: form.nome_empresa.trim(),
          cnpj: form.cnpj || null,
          tipo_lead: form.tipo_lead as never,
          origem: form.origem as never,
          aporte_valor: form.aporte_valor,
          login_pda: form.login_pda || null,
          data_inicio_contrato: form.data_inicio_contrato || null,
          data_renovacao: form.data_renovacao || null,
          cs_responsavel_id: form.cs_responsavel_id || null,
          comercial_responsavel_id: form.comercial_responsavel_id || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Cliente criado (${r.client_uid})`);
      onCreated(r.client_uid);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9998] bg-background/90 backdrop-blur-md grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 space-y-4 bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold">Novo cliente de CS</h2>
          <p className="text-xs text-muted-foreground">
            O código do cliente (4 caracteres) é gerado automaticamente. Sem responsável informado, o roteamento automático decide.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <L label="Empresa"><Input value={form.nome_empresa} onChange={(e) => setForm({ ...form, nome_empresa: e.target.value })} /></L>
          <L label="CNPJ"><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></L>
          <L label="Tipo">
            <select value={form.tipo_lead} onChange={(e) => setForm({ ...form, tipo_lead: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {CS_CLIENT_TYPES.map((t) => <option key={t} value={t}>{CS_CLIENT_TYPE_LABEL[t]}</option>)}
            </select>
          </L>
          <L label="Origem">
            <select value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {CS_ORIGINS.map((o) => <option key={o} value={o}>{CS_ORIGIN_LABEL[o]}</option>)}
            </select>
          </L>
          <L label="Aporte (R$)">
            <Input type="number" value={form.aporte_valor} onChange={(e) => setForm({ ...form, aporte_valor: Number(e.target.value) })} />
          </L>
          <L label="Login PDA"><Input value={form.login_pda} onChange={(e) => setForm({ ...form, login_pda: e.target.value })} /></L>
          <L label="Início contrato">
            <Input type="date" value={form.data_inicio_contrato} onChange={(e) => setForm({ ...form, data_inicio_contrato: e.target.value })} />
          </L>
          <L label="Renovação">
            <Input type="date" value={form.data_renovacao} onChange={(e) => setForm({ ...form, data_renovacao: e.target.value })} />
          </L>
          <L label="Responsável CS (opcional)">
            <select value={form.cs_responsavel_id} onChange={(e) => setForm({ ...form, cs_responsavel_id: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Roteamento automático</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </L>
          <L label="Comercial que fechou (opcional)">
            <select value={form.comercial_responsavel_id} onChange={(e) => setForm({ ...form, comercial_responsavel_id: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Roteamento automático</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </L>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={create.isPending || !form.nome_empresa.trim()} onClick={() => create.mutate()}>
            {create.isPending ? "Criando…" : "Criar cliente"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
