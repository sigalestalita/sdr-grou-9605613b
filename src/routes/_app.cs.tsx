import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCurrentRole } from "@/lib/use-role";
import { listEmpresasDaBase, type EmpresaDaBase } from "@/lib/empresa-unificada.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/use-auth";

import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CsClientCard } from "@/components/cs/cs-client-card";
import { CsAlertModal } from "@/components/cs/cs-alert-modal";
import { SignalStrip } from "@/components/cs/signal-strip";
import { fmtDate } from "@/components/cs/cs-client-sections";
import {
  ColumnPicker,
  FilterChip,
  ViewTabs,
  useSavedViews,
  useVisibleColumns,
  type ColumnDef,
  type SavedView,
} from "@/components/crm/list-controls";
import { downloadCsv } from "@/lib/export-csv";
import {
  listCsBoard,
  moveCsStage,
  runCsAlertScan,
  saveCsClient,
  syncCsSignal,
} from "@/lib/cs.functions";
import {
  CS_AGENDA_TYPE_LABEL,
  CS_CLIENT_TYPES,
  CS_CLIENT_TYPE_LABEL,
  CS_ORIGINS,
  CS_ORIGIN_LABEL,
  CS_SIGNALS,
  CS_SIGNAL_CLASS,
  CS_SIGNAL_LABEL,
  CS_STAGES,
  CS_STAGE_LABEL,
  daysBetween,
  healthLabel,
  type CsSignal,
  CS_TAG_USO,
  CS_TAG_USO_LABEL,
} from "@/lib/cs-types";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Download,
  Kanban,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
  Combine,
} from "lucide-react";
import { EtapasVisiveis, useEtapasOcultas } from "@/components/kanban/etapas-ocultas";

export const Route = createFileRoute("/_app/cs")({
  component: CsPage,
  head: () => ({
    meta: [
      { title: "Empresas · Customer Success | Grou Compass" },
      {
        name: "description",
        content:
          "Carteira de Customer Success: empresas clientes, sinaleira de engajamento PDA, health score, jornada e alertas.",
      },
      { property: "og:title", content: "Empresas · Customer Success | Grou Compass" },
      {
        property: "og:description",
        content: "Carteira de clientes, sinaleira de engajamento, health score e alertas de CS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* ------------------------------------------------------------------ */
/* Filtros e visões                                                    */
/* ------------------------------------------------------------------ */

type Filters = {
  q: string;
  owner: string;
  exec: string;
  signal: string;
  stage: string;
  tag: string;
  tipo: string;
  /** Uso do PDA (tag_uso): recrutamento | desenvolvimento | ambos. */
  tagUso: string;
  ativo: "ativos" | "todos";
  /** Só a carteira do usuário logado (CS ou executivo). */
  mine: boolean;
  /** Mínimo de semanas consecutivas em vermelho. */
  redWeeks: number;
  /** Renovação nos próximos N dias. */
  renewalDays: number;
  /** Clientes (com ficha do CS), a base inteira ou só quem ainda não é cliente. */
  base?: "clientes" | "todas" | "nao_clientes";
};

const EMPTY: Filters = {
  q: "",
  owner: "",
  exec: "",
  signal: "",
  stage: "",
  tag: "",
  tipo: "",
  tagUso: "",
  ativo: "ativos",
  mine: false,
  redWeeks: 0,
  renewalDays: 0,
  base: "clientes",
};

const BUILTIN_VIEWS: SavedView<Filters>[] = [
  { id: "carteira", label: "Carteira CS", builtin: true, filters: { tipo: "empresa" } },
  { id: "minha", label: "Minha carteira", builtin: true, filters: { mine: true } },
  { id: "vermelho5", label: "Vermelhos 5+ semanas", builtin: true, filters: { redWeeks: 5 } },
  { id: "renov60", label: "Renovação ≤ 60 d", builtin: true, filters: { renewalDays: 60 } },
  {
    id: "todas",
    label: "Clientes ativos e inativos",
    builtin: true,
    filters: { ativo: "todos" },
  },
  { id: "base", label: "Base inteira", builtin: true, filters: { base: "todas" } },
];

/** Filtros que só existem para quem tem ficha do CS. */
const SO_CLIENTES: (keyof Filters)[] = [
  "owner",
  "signal",
  "stage",
  "tag",
  "tagUso",
  "tipo",
  "redWeeks",
  "renewalDays",
];
const PAGINA = 300;

const COLUMNS: ColumnDef[] = [
  { key: "empresa", label: "Empresa", always: true },
  { key: "sinaleira", label: "Sinaleira · 8 sem." },
  { key: "saude", label: "Saúde" },
  { key: "etapa", label: "Etapa" },
  { key: "cs", label: "Responsável CS" },
  { key: "exec", label: "Executivo" },
  { key: "renovacao", label: "Renovação" },
  { key: "contato", label: "Último contato" },
  { key: "alertas", label: "Alertas" },
  { key: "tags", label: "Tags" },
  { key: "tipo", label: "Tipo" },
  { key: "aporte", label: "Aporte" },
  { key: "dono", label: "Dono na base" },
  { key: "negocios", label: "Negócios abertos" },
  { key: "segmento", label: "Segmento" },
];

type SortKey = "empresa" | "saude" | "etapa" | "renovacao" | "contato" | "aporte";

const sameFilters = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

function CsPage() {
  const boardFn = useServerFn(listCsBoard);
  const stageFn = useServerFn(moveCsStage);
  const scanFn = useServerFn(runCsAlertScan);
  const syncFn = useServerFn(syncCsSignal);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Sinaleira, alertas e configurações são do CS; a lista é de todos.
  const ehCs = useCurrentRole().canAccessTeam("cs");

  const [mode, setMode] = useState<"lista" | "board">("lista");
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "empresa",
    dir: "asc",
  });

  const storageNs = `cs:empresas:${user?.id ?? "anon"}`;
  const savedViews = useSavedViews<Filters>("empresas", BUILTIN_VIEWS, `${storageNs}:views`);
  const columns = useVisibleColumns(`${storageNs}:cols`, COLUMNS);

  const [viewId, setViewId] = useState<string>("");
  const [limite, setLimite] = useState(PAGINA);
  const { ocultas: etapasCsOcultas } = useEtapasOcultas("cs-jornada");
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, ...BUILTIN_VIEWS[0].filters });
  const activeView = savedViews.views.find((v) => v.id === viewId) ?? null;
  // Ao carregar as visões da pessoa, abre a primeira.
  useEffect(() => {
    if (!viewId && savedViews.views[0]) {
      setViewId(savedViews.views[0].id);
      setFilters({ ...EMPTY, ...savedViews.views[0].filters });
    }
  }, [viewId, savedViews.views]);
  useEffect(() => setLimite(PAGINA), [filters, sort]);
  const dirty = activeView ? !sameFilters(filters, { ...EMPTY, ...activeView.filters }) : true;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  // Abre a página da empresa (substitui o antigo modal).
  const openClient = (uid: string) => navigate({ to: "/empresas/$uid", params: { uid } });

  const { data, isLoading } = useQuery({
    queryKey: ["cs-board", user?.id],
    queryFn: () => boardFn({}),
    enabled: !!user,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cs-board"] });

  // Empresas da base sem ficha do CS: só quando a visão pede a base.
  const baseFn = useServerFn(listEmpresasDaBase);
  const querBase = (filters.base ?? "clientes") !== "clientes";
  const { data: base, isLoading: carregandoBase } = useQuery({
    queryKey: ["empresas-da-base"],
    queryFn: () => baseFn({}),
    enabled: !!user && querBase,
    staleTime: 5 * 60_000,
  });

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

  const weeks = useMemo(() => data?.weeks ?? [], [data?.weeks]);
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
        if (String(cur[k] ?? "") !== String(before[k] ?? "")) diff.add(k);
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
    for (const t of data?.tags ?? [])
      map.set(t.client_uid, [...(map.get(t.client_uid) ?? []), t.tag]);
    return map;
  }, [data?.tags]);

  const tagOptions = useMemo(
    () => Array.from(new Set((data?.tags ?? []).map((t) => t.tag))).sort(),
    [data?.tags],
  );

  // Quem realmente aparece como responsável: CS (cs_responsavel_id) e executivo (comercial_responsavel_id).
  const { csOptions, execOptions } = useMemo(() => {
    const name = new Map(
      (data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id] as const),
    );
    const csIds = new Set<string>();
    const execIds = new Set<string>();
    for (const c of data?.clients ?? []) {
      if (c.cs_responsavel_id) csIds.add(c.cs_responsavel_id);
      if (c.comercial_responsavel_id) execIds.add(c.comercial_responsavel_id);
    }
    const toList = (ids: Set<string>) =>
      Array.from(ids)
        .map((id) => ({ value: id, label: name.get(id) ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return { csOptions: toList(csIds), execOptions: toList(execIds) };
  }, [data?.clients, data?.profiles]);

  const profileName = useMemo(() => {
    const map = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "—") : "Sem responsável");
  }, [data?.profiles]);

  /** Semanas consecutivas em vermelho, contando do fim da série. */
  const redStreak = (uid: string) => {
    const h = historyOf(uid);
    let n = 0;
    for (let i = h.length - 1; i >= 0 && h[i] === "vermelho"; i--) n++;
    return n;
  };

  const matches = (
    c: NonNullable<typeof data>["clients"][number],
    f: Filters,
    ignoreSignal = false,
  ) => {
    if (f.ativo === "ativos" && !c.ativo) return false;
    if (
      f.q &&
      !`${c.nome_empresa} ${c.client_uid} ${c.cnpj ?? ""}`.toLowerCase().includes(f.q.toLowerCase())
    )
      return false;
    if (f.owner && c.cs_responsavel_id !== f.owner) return false;
    if (f.exec && c.comercial_responsavel_id !== f.exec) return false;
    if (!ignoreSignal && f.signal && c.current_signal !== f.signal) return false;
    if (f.tipo && c.tipo_lead !== f.tipo) return false;
    if (f.tagUso && (c.tag_uso ?? "") !== f.tagUso) return false;
    if (f.tag && !(tagsOf.get(c.client_uid) ?? []).includes(f.tag)) return false;
    if (f.stage && c.journey_stage !== f.stage) return false;
    if (f.mine && user && c.cs_responsavel_id !== user.id && c.comercial_responsavel_id !== user.id)
      return false;
    if (f.redWeeks > 0 && redStreak(c.client_uid) < f.redWeeks) return false;
    if (f.renewalDays > 0) {
      const d = c.data_renovacao ? -(daysBetween(c.data_renovacao) ?? 0) : null;
      if (d == null || d < 0 || d > f.renewalDays) return false;
    }
    return true;
  };

  const clients = useMemo(() => {
    const list = (data?.clients ?? []).filter((c) => matches(c, filters));
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c: (typeof list)[number]) => {
      switch (sort.key) {
        case "saude":
          return c.health_score ?? 0;
        case "etapa":
          return CS_STAGES.indexOf(c.journey_stage as never);
        case "renovacao":
          return c.data_renovacao ?? "9999";
        case "contato":
          return c.last_contact_at ?? "";
        case "aporte":
          return Number(c.aporte_valor ?? 0);
        default:
          return c.nome_empresa.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.clients, filters, sort, tagsOf, historyOf, user?.id]);

  const baseRows = useMemo(() => {
    if (!querBase) return [];
    if (SO_CLIENTES.some((k) => !!filters[k])) return [];
    const q = filters.q.trim().toLowerCase();
    return (base ?? []).filter((e) => {
      if (q && !`${e.nome} ${e.cnpj ?? ""}`.toLowerCase().includes(q)) return false;
      if (filters.mine && user && e.owner_user_id !== user.id && e.sdr_user_id !== user.id)
        return false;
      if (filters.exec && e.owner_user_id !== filters.exec) return false;
      return true;
    });
  }, [base, querBase, filters, user]);

  /** Linhas da lista: fichas do CS e, se a visão pedir, empresas sem ficha. */
  const linhas = useMemo(() => {
    type Linha =
      | { tipo: "cliente"; nome: string; c: (typeof clients)[number] }
      | { tipo: "base"; nome: string; e: EmpresaDaBase };
    const doCs: Linha[] =
      filters.base === "nao_clientes"
        ? []
        : clients.map((c) => ({ tipo: "cliente" as const, nome: c.nome_empresa, c }));
    const daBase: Linha[] = baseRows.map((e) => ({ tipo: "base" as const, nome: e.nome, e }));
    if (sort.key !== "empresa") return [...doCs, ...daBase];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...doCs, ...daBase].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") * dir);
  }, [clients, baseRows, filters.base, sort]);

  // Sinaleira: contagem por cor dentro dos filtros atuais (ignorando o próprio filtro de sinaleira).
  const signalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of data?.clients ?? []) {
      if (!matches(c, filters, true)) continue;
      counts[c.current_signal] = (counts[c.current_signal] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.clients, filters, tagsOf, historyOf, user?.id]);

  const openAlerts = (data?.alerts ?? []).length;
  const avgHealth = clients.length
    ? Math.round(clients.reduce((a, c) => a + (c.health_score ?? 0), 0) / clients.length)
    : 0;

  const selectView = (v: SavedView<Filters>) => {
    setViewId(v.id);
    setFilters({ ...EMPTY, ...v.filters });
  };
  const semBusca = (f: Filters) => ({ ...f, q: "" });
  const comAviso = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a visão");
    }
  };
  const createView = () => {
    const label = window.prompt("Nome da nova visão (com os filtros atuais)");
    if (!label?.trim()) return;
    void comAviso(async () => {
      const id = await savedViews.addView(label.trim().slice(0, 60), semBusca(filters));
      if (id) setViewId(id);
    }, "Visão criada");
  };
  const renameView = (id: string) => {
    const atual = savedViews.views.find((v) => v.id === id);
    const label = window.prompt("Novo nome da visão", atual?.label ?? "");
    if (!label?.trim() || label.trim() === atual?.label) return;
    void comAviso(() => savedViews.renameView(id, label.trim().slice(0, 60)), "Visão renomeada");
  };
  const saveFilters = (id: string) =>
    void comAviso(() => savedViews.updateView(id, semBusca(filters)), "Filtros salvos na visão");
  const duplicateView = (id: string) => {
    const v = savedViews.views.find((x) => x.id === id);
    if (!v) return;
    void comAviso(async () => {
      const novo = await savedViews.addView(`${v.label} (cópia)`.slice(0, 60), v.filters);
      if (novo) selectView({ ...v, id: novo });
    }, "Visão duplicada");
  };
  const removeView = (id: string) => {
    const v = savedViews.views.find((x) => x.id === id);
    if (!v || !window.confirm(`Excluir a visão "${v.label}"?`)) return;
    void comAviso(async () => {
      await savedViews.removeView(id);
      if (viewId === id) {
        const outra = savedViews.views.find((x) => x.id !== id);
        if (outra) selectView(outra);
      }
    }, "Visão excluída");
  };
  const restoreViews = () => {
    if (!window.confirm("Voltar às visões padrão? As suas visões desta lista serão apagadas."))
      return;
    void comAviso(async () => {
      await savedViews.restoreDefaults();
      setViewId("");
    }, "Visões padrão restauradas");
  };
  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const exportCsv = () => {
    downloadCsv(
      "empresas.csv",
      clients
        .map((c) => ({
          codigo: c.client_uid,
          empresa: c.nome_empresa,
          tipo: CS_CLIENT_TYPE_LABEL[c.tipo_lead] ?? c.tipo_lead,
          sinaleira: CS_SIGNAL_LABEL[c.current_signal ?? "sem_dado"],
          saude: c.health_score ?? 0,
          etapa: String(CS_STAGE_LABEL[c.journey_stage as never] ?? c.journey_stage),
          responsavel_cs: profileName(c.cs_responsavel_id),
          executivo: profileName(c.comercial_responsavel_id),
          renovacao: c.data_renovacao ?? "",
          ultimo_contato: c.last_contact_at ?? "",
          aporte: Number(c.aporte_valor ?? 0),
          alertas_abertos: (alertsOf.get(c.client_uid) ?? []).length,
          tags: (tagsOf.get(c.client_uid) ?? []).join("; "),
        }))
        .concat(
          baseRows.map((e) => ({
            codigo: "",
            empresa: e.nome,
            tipo: "Sem ficha do CS",
            sinaleira: "",
            saude: 0,
            etapa: "",
            responsavel_cs: "",
            executivo: e.owner_user_id ? profileName(e.owner_user_id) : "",
            renovacao: "",
            ultimo_contato: "",
            aporte: 0,
            alertas_abertos: 0,
            tags: "",
          })),
        ),
    );
  };

  const hasFilter =
    !sameFilters(filters, { ...EMPTY, ...(activeView?.filters ?? {}) }) || filters.q !== "";
  const show = (key: string) => columns.visible.some((c) => c.key === key);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
      {/* Cabeçalho do objeto */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="text-[12px] text-muted-foreground">
            {isLoading || (querBase && carregandoBase)
              ? "Carregando…"
              : `${linhas.length} na visão` +
                (baseRows.length
                  ? ` · ${linhas.length - baseRows.length} clientes, ${baseRows.length} sem ficha`
                  : "") +
                ` · saúde média ${avgHealth}`}
            {openAlerts > 0 && ` · ${openAlerts} alerta(s) em aberto`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ehCs && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />{" "}
                Sincronizar sinaleira
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={scan.isPending}
                onClick={() => scan.mutate()}
              >
                <Bell className="mr-1 h-4 w-4" /> Gerar alertas
              </Button>
              <Button
                size="sm"
                variant="outline"
                title="Configurações do CS"
                onClick={() => navigate({ to: "/cs-configuracoes" })}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            title="Empresas com o mesmo CNPJ, domínio ou nome parecido"
            onClick={() => navigate({ to: "/empresas-parecidas" })}
          >
            <Combine className="mr-1 h-4 w-4" /> Empresas parecidas
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar empresa
          </Button>
        </div>
      </div>

      <div className="surface-panel">
        <div className="px-3 pt-1">
          <ViewTabs
            views={savedViews.views}
            activeId={viewId}
            dirty={dirty}
            onSelect={selectView}
            onCreate={createView}
            onRemove={removeView}
            onRename={renameView}
            onSaveFilters={saveFilters}
            onDuplicate={duplicateView}
            onMove={(id, dir) => void comAviso(() => savedViews.moveView(id, dir), "Visão movida")}
            onRestore={restoreViews}
          />
        </div>

        {/* Barra de filtros */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-56 pl-8"
              placeholder="Pesquisar"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </div>
          <FilterChip
            label="Empresas"
            value={filters.base && filters.base !== "clientes" ? filters.base : ""}
            options={[
              { value: "todas", label: "Base inteira" },
              { value: "nao_clientes", label: "Só quem não é cliente" },
            ]}
            onChange={(v) => set("base", (v || "clientes") as Filters["base"])}
          />
          <FilterChip
            label="Responsável CS"
            value={filters.owner}
            options={csOptions}
            onChange={(v) => set("owner", v)}
          />
          <FilterChip
            label="Executivo"
            value={filters.exec}
            options={execOptions}
            onChange={(v) => set("exec", v)}
          />
          <FilterChip
            label="Sinaleira"
            value={filters.signal}
            options={CS_SIGNALS.map((s) => ({
              value: s,
              label: `${CS_SIGNAL_LABEL[s]} (${signalCounts[s] ?? 0})`,
            }))}
            onChange={(v) => set("signal", v)}
          />
          <FilterChip
            label="Etapa"
            value={filters.stage}
            options={CS_STAGES.map((s) => ({ value: s, label: CS_STAGE_LABEL[s] }))}
            onChange={(v) => set("stage", v)}
          />
          <FilterChip
            label="Renovação"
            value={filters.renewalDays ? String(filters.renewalDays) : ""}
            options={[15, 30, 45, 60, 90, 120, 180, 365].map((d) => ({
              value: String(d),
              label: `Nos próximos ${d} dias`,
            }))}
            onChange={(v) => set("renewalDays", Number(v) || 0)}
          />
          <FilterChip
            label="Tag"
            value={filters.tag}
            options={tagOptions.map((t) => ({ value: t, label: CS_AGENDA_TYPE_LABEL[t] ?? t }))}
            onChange={(v) => set("tag", v)}
          />
          <FilterChip
            label="Uso do PDA"
            value={filters.tagUso}
            options={CS_TAG_USO.map((t) => ({ value: t, label: CS_TAG_USO_LABEL[t] ?? t }))}
            onChange={(v) => set("tagUso", v)}
          />
          <FilterChip
            label="Tipo"
            value={filters.tipo}
            options={CS_CLIENT_TYPES.map((t) => ({ value: t, label: CS_CLIENT_TYPE_LABEL[t] }))}
            onChange={(v) => set("tipo", v)}
          />
          <FilterChip
            label="Status"
            value={filters.ativo === "todos" ? "todos" : ""}
            options={[{ value: "todos", label: "Ativas e inativas" }]}
            onChange={(v) => set("ativo", v === "todos" ? "todos" : "ativos")}
          />
          {hasFilter && (
            <button
              type="button"
              onClick={() => (activeView ? selectView(activeView) : setFilters(EMPTY))}
              className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border">
              {(
                [
                  ["lista", List, "Lista"],
                  ["board", Kanban, "Funil"],
                ] as const
              ).map(([m, Icon, title]) => (
                <button
                  key={m}
                  type="button"
                  title={title}
                  onClick={() => setMode(m)}
                  className={`grid h-8 w-9 place-items-center ${mode === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            {mode === "lista" && (
              <ColumnPicker columns={COLUMNS} hidden={columns.hidden} onToggle={columns.toggle} />
            )}
            {mode === "board" && (
              <EtapasVisiveis
                quadro="cs-jornada"
                etapas={CS_STAGES.map((st) => ({ id: st, nome: CS_STAGE_LABEL[st] }))}
                contagem={(id) => clients.filter((c) => c.journey_stage === id).length}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={exportCsv}
              disabled={linhas.length === 0}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Exportar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando carteira…</p>
        ) : mode === "lista" ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortTh label="Empresa" k="empresa" sort={sort} onSort={toggleSort} />
                  {show("sinaleira") && <th>Sinaleira · 8 sem.</th>}
                  {show("saude") && (
                    <SortTh label="Saúde" k="saude" sort={sort} onSort={toggleSort} />
                  )}
                  {show("etapa") && (
                    <SortTh label="Etapa" k="etapa" sort={sort} onSort={toggleSort} />
                  )}
                  {show("cs") && <th>Responsável CS</th>}
                  {show("exec") && <th>Executivo</th>}
                  {show("renovacao") && (
                    <SortTh label="Renovação" k="renovacao" sort={sort} onSort={toggleSort} />
                  )}
                  {show("contato") && (
                    <SortTh label="Último contato" k="contato" sort={sort} onSort={toggleSort} />
                  )}
                  {show("alertas") && <th>Alertas</th>}
                  {show("tags") && <th>Tags</th>}
                  {show("tipo") && <th>Tipo</th>}
                  {show("aporte") && (
                    <SortTh label="Aporte" k="aporte" sort={sort} onSort={toggleSort} />
                  )}
                  {show("dono") && <th>Dono na base</th>}
                  {show("negocios") && <th>Negócios abertos</th>}
                  {show("segmento") && <th>Segmento</th>}
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={15} className="text-muted-foreground">
                      {querBase && carregandoBase
                        ? "Carregando a base de empresas…"
                        : "Nenhuma empresa nesta visão."}
                    </td>
                  </tr>
                )}
                {linhas.slice(0, limite).map((l) => {
                  if (l.tipo === "base") {
                    const e = l.e;
                    const vazio = <td className="text-muted-foreground">—</td>;
                    return (
                      <tr key={e.id} className="cursor-pointer" onClick={() => openClient(e.id)}>
                        <td>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
                            <Link
                              to="/empresas/$uid"
                              params={{ uid: e.id }}
                              onClick={(ev) => ev.stopPropagation()}
                              className="truncate font-medium text-primary hover:underline"
                            >
                              {e.nome}
                            </Link>
                            <Badge variant="outline" className="text-[10px]">
                              {e.negocios_ganhos > 0 ? "já comprou" : "não é cliente"}
                            </Badge>
                          </div>
                        </td>
                        {show("sinaleira") && vazio}
                        {show("saude") && vazio}
                        {show("etapa") && (
                          <td className="whitespace-nowrap text-muted-foreground">
                            Sem ficha do CS
                          </td>
                        )}
                        {show("cs") && vazio}
                        {show("exec") && vazio}
                        {show("renovacao") && vazio}
                        {show("contato") && vazio}
                        {show("alertas") && vazio}
                        {show("tags") && vazio}
                        {show("tipo") && vazio}
                        {show("aporte") && vazio}
                        {show("dono") && (
                          <td className="whitespace-nowrap">
                            {e.owner_user_id ? profileName(e.owner_user_id) : "—"}
                          </td>
                        )}
                        {show("negocios") && (
                          <td className="metric-value">{e.negocios_abertos || "—"}</td>
                        )}
                        {show("segmento") && <td>{e.segmento ?? "—"}</td>}
                      </tr>
                    );
                  }
                  const c = l.c;
                  const health = healthLabel(c.health_score ?? 0);
                  const alerts = alertsOf.get(c.client_uid) ?? [];
                  const tags = tagsOf.get(c.client_uid) ?? [];
                  const streak = redStreak(c.client_uid);
                  return (
                    <tr
                      key={c.client_uid}
                      className="cursor-pointer"
                      onClick={() => openClient(c.client_uid)}
                    >
                      <td>
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${CS_SIGNAL_CLASS[c.current_signal ?? "sem_dado"]}`}
                          />
                          <Link
                            to="/empresas/$uid"
                            params={{ uid: c.client_uid }}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-medium text-primary hover:underline"
                          >
                            {c.nome_empresa}
                          </Link>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {c.client_uid}
                          </span>
                          {!c.ativo && (
                            <Badge variant="outline" className="text-[10px]">
                              inativa
                            </Badge>
                          )}
                        </div>
                      </td>
                      {show("sinaleira") && (
                        <td>
                          <div className="flex items-center gap-2">
                            <SignalStrip history={historyOf(c.client_uid)} weeks={weeks} />
                            <span className="text-[11px] text-muted-foreground">
                              {streak >= 2
                                ? `${streak} sem. vermelho`
                                : CS_SIGNAL_LABEL[c.current_signal ?? "sem_dado"]}
                            </span>
                          </div>
                        </td>
                      )}
                      {show("saude") && (
                        <td>
                          <span className={`metric-value ${health.cls}`}>
                            {c.health_score ?? 0}
                          </span>
                        </td>
                      )}
                      {show("etapa") && (
                        <td className="whitespace-nowrap">
                          {CS_STAGE_LABEL[c.journey_stage as never] ?? c.journey_stage}
                        </td>
                      )}
                      {show("cs") && (
                        <td className="whitespace-nowrap">{profileName(c.cs_responsavel_id)}</td>
                      )}
                      {show("exec") && (
                        <td className="whitespace-nowrap">
                          {profileName(c.comercial_responsavel_id)}
                        </td>
                      )}
                      {show("renovacao") && (
                        <td className="whitespace-nowrap">{fmtDate(c.data_renovacao)}</td>
                      )}
                      {show("contato") && (
                        <td className="whitespace-nowrap">{fmtDate(c.last_contact_at)}</td>
                      )}
                      {show("alertas") && (
                        <td>
                          {alerts.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenAlert(alerts[0].id);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px]"
                            >
                              <Bell className="h-3 w-3" /> {alerts.length}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      {show("tags") && (
                        <td>
                          <div className="flex max-w-[260px] flex-wrap gap-1">
                            {tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {CS_AGENDA_TYPE_LABEL[t] ?? t}
                              </Badge>
                            ))}
                            {tags.length > 3 && (
                              <span className="text-[11px] text-muted-foreground">
                                +{tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {show("tipo") && <td>{CS_CLIENT_TYPE_LABEL[c.tipo_lead] ?? c.tipo_lead}</td>}
                      {show("aporte") && (
                        <td className="metric-value whitespace-nowrap">
                          R$ {Number(c.aporte_valor ?? 0).toLocaleString("pt-BR")}
                        </td>
                      )}
                      {show("dono") && <td className="text-muted-foreground">—</td>}
                      {show("negocios") && <td className="text-muted-foreground">—</td>}
                      {show("segmento") && <td>{(c as { setor?: string | null }).setor ?? "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 p-3 lg:grid-cols-3">
            {CS_STAGES.filter((stage) => !etapasCsOcultas.has(stage)).map((stage) => {
              const col = clients.filter((c) => c.journey_stage === stage);
              return (
                <div key={stage} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{CS_STAGE_LABEL[stage]}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {col.length}
                    </Badge>
                  </div>
                  {col.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum cliente nesta etapa.</p>
                  )}
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
                      onOpen={openClient}
                      onOpenAlert={setOpenAlert}
                      onMove={(uid, s) => move.mutate({ clientUid: uid, stage: s })}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 border-t px-3 py-2 text-[12px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-foreground">
            {linhas.length} empresa{linhas.length === 1 ? "" : "s"}
          </span>
          {mode === "lista" && linhas.length > limite && (
            <button
              type="button"
              onClick={() => setLimite((n) => n + PAGINA)}
              className="font-medium text-primary hover:underline"
            >
              Mostrar mais {Math.min(PAGINA, linhas.length - limite)} (mostrando {limite})
            </button>
          )}
          {mode === "board" && baseRows.length > 0 && (
            <span>O funil mostra só quem tem ficha do CS.</span>
          )}
          {activeView && (
            <span>
              Visão: {activeView.label}
              {dirty ? " (editada)" : ""}
            </span>
          )}
        </div>
      </div>

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
            openClient(uid);
          }}
        />
      )}
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  return (
    <th>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
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
    <div
      className="fixed inset-0 z-[9998] bg-background/90 backdrop-blur-md grid place-items-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg p-6 space-y-4 bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">Nova empresa</h2>
          <p className="text-xs text-muted-foreground">
            O código da empresa (4 caracteres) é gerado automaticamente. Sem responsável informado,
            o roteamento automático decide.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <L label="Empresa">
            <Input
              value={form.nome_empresa}
              onChange={(e) => setForm({ ...form, nome_empresa: e.target.value })}
            />
          </L>
          <L label="CNPJ">
            <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </L>
          <L label="Tipo">
            <select
              value={form.tipo_lead}
              onChange={(e) => setForm({ ...form, tipo_lead: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {CS_CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CS_CLIENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </L>
          <L label="Origem">
            <select
              value={form.origem}
              onChange={(e) => setForm({ ...form, origem: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {CS_ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {CS_ORIGIN_LABEL[o]}
                </option>
              ))}
            </select>
          </L>
          <L label="Aporte (R$)">
            <Input
              type="number"
              value={form.aporte_valor}
              onChange={(e) => setForm({ ...form, aporte_valor: Number(e.target.value) })}
            />
          </L>
          <L label="Login PDA">
            <Input
              value={form.login_pda}
              onChange={(e) => setForm({ ...form, login_pda: e.target.value })}
            />
          </L>
          <L label="Início contrato">
            <Input
              type="date"
              value={form.data_inicio_contrato}
              onChange={(e) => setForm({ ...form, data_inicio_contrato: e.target.value })}
            />
          </L>
          <L label="Renovação">
            <Input
              type="date"
              value={form.data_renovacao}
              onChange={(e) => setForm({ ...form, data_renovacao: e.target.value })}
            />
          </L>
          <L label="Responsável CS (opcional)">
            <select
              value={form.cs_responsavel_id}
              onChange={(e) => setForm({ ...form, cs_responsavel_id: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Roteamento automático</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </L>
          <L label="Comercial que fechou (opcional)">
            <select
              value={form.comercial_responsavel_id}
              onChange={(e) => setForm({ ...form, comercial_responsavel_id: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Roteamento automático</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </L>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={create.isPending || !form.nome_empresa.trim()}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Criando…" : "Criar empresa"}
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
