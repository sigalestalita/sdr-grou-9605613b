import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef, type SyntheticEvent } from "react";
import { listKanbanData, moveLeadStage, createManualLead, updateLead } from "@/lib/leads.functions";
import { getOrCreateConversationForLead } from "@/lib/whatsapp.functions";
import { syncRdLeads } from "@/lib/rd-station.functions";
import { autoEnrichPendingLeads, recalculatePendingScores } from "@/lib/ai.functions";
import { syncLeadsFromSheet } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LostReasonFilter } from "@/components/leads/lost-reason-filter";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import {
  LEAD_TYPE_LABEL,
  LEAD_TYPE_COLOR,
  normalizeLeadType,
  type LeadType,
} from "@/lib/lead-type";
import {
  DEMO_FREE_LABEL,
  DEMO_FREE_OPTIONS,
  DEMO_FREE_TONE,
  resolveDemoFree,
} from "@/lib/demo-free";
import { evaluateIcpFit } from "@/lib/icp-fit";
import { getTouchRules, setFollowUpDone } from "@/lib/touches.functions";
import { DEFAULT_TOUCH_RULES, channelLabel, outcomeLabel, daysSince } from "@/lib/touch-types";
import { TouchSequenceModal } from "@/components/leads/touch-sequence";
import { buildCadencePlan, evaluateSla, resolveTrack } from "@/lib/sdr-cadence";
import { TRACK_LABEL } from "@/lib/sdr-playbook";
import { useAuth } from "@/lib/use-auth";
import { downloadCsv } from "@/lib/export-csv";
import { toast } from "sonner";
import {
  RefreshCw,
  Plus,
  Search,
  Calendar,
  Clock,
  Timer,
  User as UserIcon,
  Flame,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
  LinkedinIcon,
  MessageCircle,
  GraduationCap,
  Activity,
  AlertTriangle,
  CalendarClock,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/kanban")({
  head: () => ({ meta: [{ title: "Kanban — SDR GROU" }] }),
  component: KanbanPage,
});

type KanbanLead = import("@/lib/lead-types").Lead;

function isCertificationLead(lead: KanbanLead) {
  const formPayload = lead.form_payload;
  const values = [
    lead.campaign,
    lead.source,
    lead.ad_name,
    lead.company_segment,
    ...(formPayload && typeof formPayload === "object"
      ? Object.values(formPayload).filter((value): value is string => typeof value === "string")
      : []),
  ].filter((value): value is string => typeof value === "string");

  return values.some((value) => /certifica/i.test(value));
}

function resolveLeadType(lead: KanbanLead): LeadType | null {
  const raw = (lead.form_payload as { lead_type?: string } | null)?.lead_type ?? null;
  return (lead.lead_type as LeadType | null) ?? normalizeLeadType(raw);
}

type Funnel = "comercial" | "consultoria";

function leadInFunnel(lead: KanbanLead, funnel: Funnel) {
  const t = resolveLeadType(lead);
  return funnel === "consultoria" ? t === "consultoria" : t !== "consultoria";
}

function KanbanPage() {
  const { session } = useAuth();
  const fetchData = useServerFn(listKanbanData);
  const moveFn = useServerFn(moveLeadStage);
  const syncFn = useServerFn(syncRdLeads);
  const createFn = useServerFn(createManualLead);
  const updateFn = useServerFn(updateLead);
  const autoEnrichFn = useServerFn(autoEnrichPendingLeads);
  const recalcFn = useServerFn(recalculatePendingScores);
  const sheetSyncFn = useServerFn(syncLeadsFromSheet);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [lostFor, setLostFor] = useState<{ leadId: string; stageId: string } | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [companySize, setCompanySize] = useState<string>("all");
  const [assigned, setAssigned] = useState<string>("all");
  const [demoFree, setDemoFree] = useState<string>("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState<string>("all");
  const [funnel, setFunnel] = useState<Funnel>("comercial");
  const [certificationFilter, setCertificationFilter] = useState<string>("all");
  const [touchAlert, setTouchAlert] = useState<string>("all");
  const [adFilter, setAdFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [lostReasons, setLostReasons] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount =
    [
      priority,
      companySize,
      assigned,
      demoFree,
      leadTypeFilter,
      certificationFilter,
      adFilter,
      sourceFilter,
      touchAlert,
    ].filter((v) => v !== "all").length +
    (dateFrom || dateTo ? 1 : 0) +
    (lostReasons.length ? 1 : 0);
  const touchRulesFn = useServerFn(getTouchRules);

  const { data, isLoading } = useQuery({
    queryKey: ["kanban"],
    queryFn: () => fetchData(),
    // Volta ao Pipeline sem tela em branco: mostra o que já tinha e atualiza atrás.
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { data: touchRulesData } = useQuery({
    queryKey: ["touch-rules"],
    queryFn: () => touchRulesFn({}),
  });

  // Auto-enriquecimento + recálculo de score em background.
  // - Enriquece leads com enrichment_status='pending'.
  // - Recalcula score/priority de todos os leads `found` (idempotente — só grava
  //   quando muda). Garante que mudanças nas regras de ICP refletem nos cards.
  const enrichingRef = useRef(false);
  const recalcRunRef = useRef(false);
  const sheetSyncRef = useRef(0);
  useEffect(() => {
    if (!session) return;
    const leads = data?.leads ?? [];
    const pendingEnrich = leads.filter((l) => l.enrichment_status === "pending").length;
    const enrichedCount = leads.filter((l) => l.enrichment_status === "found").length;
    const shouldRecalc = enrichedCount > 0 && !recalcRunRef.current;
    if (enrichingRef.current) return;
    let cancelled = false;
    const run = async () => {
      if (enrichingRef.current) return;
      enrichingRef.current = true;
      try {
        let changed = 0;
        // Sync da planilha do Meta a cada 60s
        const now = Date.now();
        if (now - sheetSyncRef.current > 60_000) {
          sheetSyncRef.current = now;
          try {
            const s = await sheetSyncFn({ data: {} });
            if (s?.inserted) changed += s.inserted;
          } catch {
            /* silencioso */
          }
        }
        if (shouldRecalc) {
          recalcRunRef.current = true;
          const r = await recalcFn({ data: { limit: 200 } });
          changed += r?.updated ?? 0;
        }
        if (pendingEnrich > 0) {
          const r = await autoEnrichFn({ data: { limit: 5 } });
          changed += r?.ok ?? 0;
        }
        if (!cancelled && changed > 0) {
          qc.invalidateQueries({ queryKey: ["kanban"] });
        }
      } catch {
        /* silencioso */
      } finally {
        enrichingRef.current = false;
      }
    };
    run();
    const t = setInterval(run, 90_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session, data?.leads, autoEnrichFn, recalcFn, sheetSyncFn, qc]);

  const move = useMutation({
    mutationFn: (vars: { leadId: string; stageId: string }) => moveFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["kanban"] });
      const prev = qc.getQueryData<Awaited<ReturnType<typeof fetchData>>>(["kanban"]);
      if (prev) {
        qc.setQueryData(["kanban"], {
          ...prev,
          leads: prev.leads.map((l) =>
            l.id === vars.leadId
              ? {
                  ...l,
                  stage_id: vars.stageId,
                  stage_entered_at: new Date().toISOString(),
                  last_action_at: new Date().toISOString(),
                }
              : l,
          ),
        });
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["kanban"], ctx.prev);
      toast.error(e instanceof Error ? e.message : "Falha ao mover");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["kanban"] }),
  });

  const sync = useMutation({
    mutationFn: async () => {
      const result = await syncFn();
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.created} novos, ${r.updated} atualizados`);
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Falha ao sincronizar";
      toast.error(message, {
        description: message.includes("RD Station recusou")
          ? "Vá em Configurações > RD Station CRM e conecte novamente antes de sincronizar."
          : undefined,
      });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [focusedCol, setFocusedCol] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.tagName === "SELECT" ||
          tgt.isContentEditable)
      )
        return;
      const stages = data?.stages ?? [];
      if (stages.length === 0) return;
      e.preventDefault();
      setFocusedCol((i) => {
        const next =
          e.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(stages.length - 1, i + 1);
        const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-col-index="${next}"]`);
        el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.stages]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!data) return null;

  const filtered = data.leads.filter((l) => {
    if (!leadInFunnel(l, funnel)) return false;
    if (touchAlert !== "all") {
      const rules = touchRulesData ?? DEFAULT_TOUCH_RULES;
      const stage = data.stages.find((s) => s.id === l.stage_id) ?? null;
      const sinceTouch = daysSince(l.last_touch_at);
      const sinceStage = daysSince(l.stage_entered_at);
      if (touchAlert === "sem_touch" && !((l.touch_count ?? 0) === 0 && !stage?.is_terminal))
        return false;
      if (
        touchAlert === "esquecido" &&
        !(
          !stage?.is_terminal &&
          (l.touch_count ?? 0) > 0 &&
          sinceTouch != null &&
          sinceTouch >= rules.staleTouchDays
        )
      )
        return false;
      if (
        touchAlert === "parado" &&
        !(!stage?.is_terminal && sinceStage != null && sinceStage >= rules.staleStageDays)
      )
        return false;
      if (
        touchAlert === "fup_vencido" &&
        !(l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() <= Date.now())
      )
        return false;
      if (
        touchAlert === "abaixo_minimo" &&
        !(stage?.is_terminal && (l.touch_count ?? 0) < rules.minTouchesBeforeDiscard)
      )
        return false;
    }
    if (priority !== "all" && l.priority !== priority) return false;
    if (companySize !== "all" && (l.company_size ?? "") !== companySize) return false;
    if (assigned === "none" && l.assigned_to) return false;
    if (assigned !== "all" && assigned !== "none" && l.assigned_to !== assigned) return false;
    if (demoFree !== "all") {
      const df = resolveDemoFree(l);
      if (demoFree === "nd" ? df != null : df !== demoFree) return false;
    }
    if (certificationFilter === "certificacao" && !isCertificationLead(l)) return false;
    if (adFilter !== "all") {
      const ad = (l.ad_name ?? "").trim();
      if (adFilter === "nd" ? ad !== "" : ad !== adFilter) return false;
    }
    if (sourceFilter !== "all") {
      const src = (l.source ?? "").trim();
      if (sourceFilter === "nd" ? src !== "" : src !== sourceFilter) return false;
    }
    if (lostReasons.length) {
      const stage = data.stages.find((s) => s.id === l.stage_id) ?? null;
      if (stage?.slug !== "desqualificado") return false;
      const reason = (l.lost_reason ?? "").trim();
      if (!lostReasons.includes(reason || "__nd")) return false;
    }
    if (leadTypeFilter !== "all") {
      const t = resolveLeadType(l);
      if (leadTypeFilter === "nd") {
        if (t) return false;
      } else if (t !== leadTypeFilter) {
        return false;
      }
    }
    const submittedRaw = (l.form_payload as { submitted_at?: string } | null)?.submitted_at ?? null;
    const convTs = submittedRaw
      ? new Date(submittedRaw).getTime()
      : l.converted_at
        ? new Date(l.converted_at).getTime()
        : new Date(l.created_at).getTime();
    if (dateFrom) {
      const fromTs = new Date(dateFrom + "T00:00:00").getTime();
      if (convTs < fromTs) return false;
    }
    if (dateTo) {
      const toTs = new Date(dateTo + "T23:59:59").getTime();
      if (convTs > toTs) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.company_name?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportFiltered = () => {
    if (filtered.length === 0) {
      toast.error("Nenhum lead na seleção atual");
      return;
    }
    const stageName = (id: string | null) => data.stages.find((s) => s.id === id)?.name ?? "";
    const ownerName = (id: string | null) => {
      const p = data.profiles.find((pr) => pr.id === id);
      return p?.full_name ?? p?.email ?? "";
    };
    const rows = filtered.map((l) => ({
      Nome: l.name ?? "",
      Email: l.email ?? "",
      Telefone: l.phone ?? "",
      Empresa: l.company_name ?? "",
      Cargo: l.job_title ?? "",
      Porte: l.company_size ?? "",
      Segmento: l.company_segment ?? "",
      Tipo: (() => {
        const t = resolveLeadType(l);
        return t ? LEAD_TYPE_LABEL[t] : "Não informado";
      })(),
      Prioridade: l.priority ? (PRIORITY_LABEL[l.priority] ?? l.priority) : "",
      Etapa: stageName(l.stage_id),
      Responsavel: ownerName(l.assigned_to),
      Origem: l.source ?? "",
      Campanha: l.campaign ?? "",
      Anuncio: l.ad_name ?? "",
      "Motivo de descarte": l.lost_reason ?? "",
      Touches: l.touch_count ?? 0,
      "Ultimo touch": l.last_touch_at ? format(new Date(l.last_touch_at), "dd/MM/yyyy HH:mm") : "",
      "Proximo FUP": l.next_follow_up_at
        ? format(new Date(l.next_follow_up_at), "dd/MM/yyyy HH:mm")
        : "",
      "Data de conversao": (() => {
        const raw =
          (l.form_payload as { submitted_at?: string } | null)?.submitted_at ??
          l.converted_at ??
          l.created_at;
        return raw ? format(new Date(raw), "dd/MM/yyyy HH:mm") : "";
      })(),
      LinkedIn: l.linkedin_url ?? "",
      Website: l.company_website ?? "",
    }));
    downloadCsv(`leads-${funnel}-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, rows);
    toast.success(`${rows.length} leads exportados`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.data.current && e.over.id !== e.active.data.current.stage_id) {
      const targetStage = data.stages.find((s) => s.id === e.over!.id);
      const payload = { leadId: e.active.id as string, stageId: e.over.id as string };
      if (targetStage?.slug === "desqualificado") {
        handleMoveTo(payload.leadId, payload.stageId);
      } else {
        move.mutate(payload);
      }
    }
  };

  const activeLead = activeId ? filtered.find((l) => l.id === activeId) : null;
  const stageById = new Map(data.stages.map((s) => [s.id, s] as const));
  const funnelLeads = data.leads.filter((l) => leadInFunnel(l, funnel));
  const sizeOptions = Array.from(
    new Set(funnelLeads.map((l) => (l.company_size ?? "").trim()).filter(Boolean)),
  ).sort();
  const assignedIds = new Set(
    funnelLeads.map((l) => l.assigned_to).filter((v): v is string => !!v),
  );
  const adCounts = new Map<string, number>();
  for (const l of funnelLeads) {
    const ad = (l.ad_name ?? "").trim();
    if (!ad) continue;
    adCounts.set(ad, (adCounts.get(ad) ?? 0) + 1);
  }
  const adOptions = Array.from(adCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const sourceCounts = new Map<string, number>();
  for (const l of funnelLeads) {
    const src = (l.source ?? "").trim();
    if (!src) continue;
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const sourceOptions = Array.from(sourceCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const disqualifiedStageId = data.stages.find((s) => s.slug === "desqualificado")?.id ?? null;
  const lostReasonCounts = new Map<string, number>();
  let lostWithoutReason = 0;
  for (const l of funnelLeads) {
    if (!disqualifiedStageId || l.stage_id !== disqualifiedStageId) continue;
    const reason = (l.lost_reason ?? "").trim();
    if (!reason) {
      lostWithoutReason += 1;
      continue;
    }
    lostReasonCounts.set(reason, (lostReasonCounts.get(reason) ?? 0) + 1);
  }
  const lostReasonOptions = Array.from(lostReasonCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const assigneeOptions = data.profiles
    .filter((p) => assignedIds.has(p.id))
    .map((p) => ({ id: p.id, label: (p.full_name || p.email || "—").trim() }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const handleMoveTo = (leadId: string, stageId: string) => {
    const targetStage = data.stages.find((s) => s.id === stageId);
    if (targetStage?.slug === "desqualificado") {
      const min = (touchRulesData ?? DEFAULT_TOUCH_RULES).minTouchesBeforeDiscard;
      const done = data.leads.find((l) => l.id === leadId)?.touch_count ?? 0;
      if (done < min) {
        const ok = window.confirm(
          `Este lead possui apenas ${done} ${done === 1 ? "tentativa" : "tentativas"} de contato (mínimo configurado: ${min}). Deseja realmente descartá-lo?`,
        );
        if (!ok) return;
      }
      setLostFor({ leadId, stageId });
    } else {
      move.mutate({ leadId, stageId });
    }
  };
  const handleUpdateLead = (id: string, patch: Record<string, unknown>) => {
    updateFn({ data: { id, patch } })
      .then(() => qc.invalidateQueries({ queryKey: ["kanban"] }))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"));
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">Pipeline</h1>
          <div className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
            {[
              { id: "comercial" as Funnel, label: "Empresas & PF" },
              { id: "consultoria" as Funnel, label: "Consultorias" },
            ].map((t) => {
              const count = data.leads.filter((l) => leadInFunnel(l, t.id)).length;
              const active = funnel === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setFunnel(t.id);
                    setLeadTypeFilter("all");
                  }}
                  className={`h-7 rounded px-2.5 text-[13px] transition-colors ${
                    active
                      ? "bg-background font-medium text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} leads no filtro atual
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, email, empresa…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-60 pl-7 text-[13px]"
            />
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setShowFilters((v) => !v)}
            title="Mostrar/ocultar filtros"
          >
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
            Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={exportFiltered}
            title="Exportar lista filtrada em CSV"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
            Sincronizar RD
          </Button>
          <Button size="sm" className="h-8" onClick={() => setShowNew(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Novo lead
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="mx-4 surface-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Filtros</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPriority("all");
                setCompanySize("all");
                setAssigned("all");
                setDemoFree("all");
                setLeadTypeFilter("all");
                setCertificationFilter("all");
                setAdFilter("all");
                setSourceFilter("all");
                setLostReasons([]);
                setTouchAlert("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Limpar filtros
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">Todas prioridades</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
              <option value="fora_icp">Fora de ICP</option>
              <option value="pendente">Pendente</option>
            </select>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Porte da empresa"
            >
              <option value="all">Todos os portes</option>
              {sizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Responsável"
            >
              <option value="all">Todos responsáveis</option>
              <option value="none">Sem responsável</option>
              {assigneeOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              value={demoFree}
              onChange={(e) => setDemoFree(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Demo Free"
            >
              <option value="all">Demo Free: todos</option>
              {DEMO_FREE_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {DEMO_FREE_LABEL[k]}
                </option>
              ))}
              <option value="nd">Demo Free: não informado</option>
            </select>
            {funnel === "comercial" && (
              <select
                value={leadTypeFilter}
                onChange={(e) => setLeadTypeFilter(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                title="Tipo de lead"
              >
                <option value="all">Tipo: todos</option>
                <option value="empresa">Empresa</option>
                <option value="pessoa_fisica">Pessoa física</option>
                <option value="nd">Não informado</option>
              </select>
            )}
            <select
              value={certificationFilter}
              onChange={(e) => setCertificationFilter(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Interesse em Certificação"
            >
              <option value="all">Interesse: todos</option>
              <option value="certificacao">Somente Certificação</option>
            </select>
            <select
              value={adFilter}
              onChange={(e) => setAdFilter(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Anúncio"
            >
              <option value="all">Anúncio: todos (melhor → pior)</option>
              <option value="nd">Sem anúncio</option>
              {adOptions.map(([ad, count]) => (
                <option key={ad} value={ad}>{`${count} • ${ad}`}</option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Origem"
            >
              <option value="all">Origem: todas (melhor → pior)</option>
              <option value="nd">Sem origem</option>
              {sourceOptions.map(([src, count]) => (
                <option key={src} value={src}>{`${count} • ${src}`}</option>
              ))}
            </select>
            <select
              value={touchAlert}
              onChange={(e) => setTouchAlert(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              title="Alertas de cadência"
            >
              <option value="all">Alertas: todos</option>
              <option value="sem_touch">Sem nenhum touch</option>
              <option value="esquecido">Sem touch há X dias</option>
              <option value="parado">Parado na etapa há X dias</option>
              <option value="fup_vencido">Follow-up vencido</option>
              <option value="abaixo_minimo">Descartado abaixo do mínimo</option>
            </select>
            {lostReasonOptions.length === 0 && lostWithoutReason === 0 ? null : (
              <LostReasonFilter
                options={lostReasonOptions.map(([reason, count]) => ({ reason, count }))}
                withoutReasonCount={lostWithoutReason}
                value={lostReasons}
                onChange={setLostReasons}
                label="Motivo de descarte"
              />
            )}
            <div className="flex flex-wrap items-center gap-1 sm:col-span-2">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const fmt = (d: Date) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, "0");
                    const day = String(d.getDate()).padStart(2, "0");
                    return `${y}-${m}-${day}`;
                  };
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  let from = new Date(today);
                  let to = new Date(today);
                  if (v === "hoje") {
                    /* same */
                  } else if (v === "ontem") {
                    from.setDate(from.getDate() - 1);
                    to.setDate(to.getDate() - 1);
                  } else if (v === "7d") {
                    from.setDate(from.getDate() - 6);
                  } else if (v === "15d") {
                    from.setDate(from.getDate() - 14);
                  } else if (v === "mes") {
                    from = new Date(today.getFullYear(), today.getMonth(), 1);
                  } else if (v === "mes_ant") {
                    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    to = new Date(today.getFullYear(), today.getMonth(), 0);
                  }
                  setDateFrom(fmt(from));
                  setDateTo(fmt(to));
                }}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                title="Período rápido"
              >
                <option value="">Período…</option>
                <option value="hoje">Hoje</option>
                <option value="ontem">Ontem</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="15d">Últimos 15 dias</option>
                <option value="mes">Este mês</option>
                <option value="mes_ant">Mês anterior</option>
              </select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[140px]"
                title="Conversão a partir de"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[140px]"
                title="Conversão até"
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div ref={scrollerRef} className="flex gap-2.5 overflow-x-auto px-4 pb-4">
          {data.stages.map((s, idx) => {
            let stageLeads = filtered.filter((l) => l.stage_id === s.id);
            if (s.slug === "novo") {
              stageLeads = [...stageLeads].sort((a, b) => {
                const fa = evaluateIcpFit(a).score;
                const fb = evaluateIcpFit(b).score;
                if (fb !== fa) return fb - fa;
                const ra = (a.form_payload as { submitted_at?: string } | null)?.submitted_at;
                const rb = (b.form_payload as { submitted_at?: string } | null)?.submitted_at;
                const ta = ra ? new Date(ra).getTime() : new Date(a.created_at).getTime();
                const tb = rb ? new Date(rb).getTime() : new Date(b.created_at).getTime();
                return tb - ta;
              });
            }
            return (
              <Column
                key={s.id}
                stageId={s.id}
                name={s.slug === "novo" ? "Novo lead · Priorização" : s.name}
                color={s.color}
                count={stageLeads.length}
                index={idx}
                focused={idx === focusedCol}
              >
                {stageLeads.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    stageSlug={s.slug}
                    stages={data.stages}
                    profiles={data.profiles}
                    executivoIds={data.executivoIds}
                    onMoveTo={handleMoveTo}
                    onUpdate={handleUpdateLead}
                  />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeLead ? (
            <LeadCard
              lead={activeLead}
              stageSlug={stageById.get(activeLead.stage_id ?? "")?.slug ?? ""}
              stages={data.stages}
              profiles={data.profiles}
              executivoIds={data.executivoIds}
              onMoveTo={handleMoveTo}
              onUpdate={handleUpdateLead}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {showNew && (
        <NewLeadDialog
          onClose={() => setShowNew(false)}
          onSubmit={async (d) => {
            try {
              await createFn({ data: d });
              toast.success("Lead criado");
              qc.invalidateQueries({ queryKey: ["kanban"] });
              setShowNew(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        />
      )}

      {lostFor && (
        <LostReasonDialog
          onClose={() => setLostFor(null)}
          onPick={async (reason) => {
            try {
              await updateFn({ data: { id: lostFor.leadId, patch: { lost_reason: reason } } });
              await move.mutateAsync(lostFor);
              setLostFor(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        />
      )}
    </div>
  );
}

function Column({
  stageId,
  name,
  color,
  count,
  index,
  focused,
  children,
}: {
  stageId: string;
  name: string;
  color: string;
  count: number;
  index: number;
  focused: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      data-col-index={index}
      className={`w-[272px] shrink-0 rounded-md border border-border bg-surface ${isOver ? "border-primary/60 bg-primary/5" : ""} ${focused ? "border-primary/40" : ""}`}
    >
      <div className="sticky top-0 z-1 flex items-center justify-between gap-2 rounded-t-md border-b border-border bg-surface/95 px-2.5 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {name}
          </span>
        </div>
        <span className="metric-value text-[11px] text-muted-foreground">{count}</span>
      </div>
      <div className="min-h-[100px] space-y-1.5 p-1.5">{children}</div>
    </div>
  );
}

function LeadCard({
  lead,
  stageSlug,
  stages,
  profiles,
  executivoIds = [],
  onMoveTo,
  onUpdate,
  overlay,
}: {
  lead: import("@/lib/lead-types").Lead;
  stageSlug: string;
  stages: { id: string; slug: string; name: string; position: number }[];
  profiles: { id: string; full_name: string | null; email: string | null }[];
  /** Ids dos usuários com papel executivo (opções de "executivo da agenda"). */
  executivoIds?: string[];
  onMoveTo: (leadId: string, stageId: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { stage_id: lead.stage_id },
  });

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);
  const currentIdx = sortedStages.findIndex((s) => s.id === lead.stage_id);
  const prevStage = currentIdx > 0 ? sortedStages[currentIdx - 1] : null;
  const nextStage =
    currentIdx >= 0 && currentIdx < sortedStages.length - 1 ? sortedStages[currentIdx + 1] : null;

  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(lead.lost_reason ?? "");
  const [showTouches, setShowTouches] = useState(false);
  const reasonOptions = ["Sem perfil", "Sem fit com soluções", "Sem contato"];

  const stopDrag = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const convertedAt = lead.converted_at ? new Date(lead.converted_at) : null;
  const stageEnteredAt = lead.stage_entered_at ? new Date(lead.stage_entered_at) : null;
  const meetingAt = lead.meeting_at ? new Date(lead.meeting_at) : null;
  const submittedRaw =
    (lead.form_payload as { submitted_at?: string } | null)?.submitted_at ?? null;
  const submittedAt = submittedRaw ? new Date(submittedRaw) : new Date(lead.created_at);

  const sinceConversion =
    convertedAt && stageEnteredAt
      ? formatDistanceToNow(convertedAt, { locale: ptBR }) // total tempo desde conversão
      : null;
  const daysInStage = stageEnteredAt
    ? Math.max(0, differenceInDays(new Date(), stageEnteredAt))
    : null;

  const formPayload = (lead.form_payload ?? null) as Record<string, unknown> | null;
  const formEntries =
    formPayload && typeof formPayload === "object"
      ? Object.entries(formPayload)
          .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
          .slice(0, 6)
      : [];

  const icpFit = evaluateIcpFit(lead);
  const isHotIcp = stageSlug === "novo" && icpFit.score >= 2;
  const assignedProfile = lead.assigned_to ? profiles.find((p) => p.id === lead.assigned_to) : null;
  const assignedLabel = assignedProfile?.full_name ?? assignedProfile?.email ?? null;
  const isCertification = isCertificationLead(lead);

  const navigate = useNavigate();
  const openChatFn = useServerFn(getOrCreateConversationForLead);
  const openChat = useMutation({
    mutationFn: () => openChatFn({ data: { leadId: lead.id } }),
    onSuccess: (res) => {
      const id = res?.conversation?.id;
      if (!id) return;
      navigate({ to: "/whatsapp", search: { c: id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao abrir chat"),
  });

  const qcCard = useQueryClient();
  const fupDoneFn = useServerFn(setFollowUpDone);
  const fupDone = useMutation({
    mutationFn: () => fupDoneFn({ data: { leadId: lead.id, done: true } }),
    onSuccess: () => {
      toast.success("Follow-up concluído");
      qcCard.invalidateQueries({ queryKey: ["kanban"] });
      qcCard.invalidateQueries({ queryKey: ["lead-touches", lead.id] });
      qcCard.invalidateQueries({ queryKey: ["fup-agenda"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const content = (
    <Card
      className={`relative cursor-grab rounded-md border border-border bg-card p-2.5 shadow-none transition-colors hover:border-primary/40 active:cursor-grabbing ${
        isDragging ? "opacity-30" : ""
      } ${overlay ? "shadow-md" : ""} ${
        isHotIcp ? "ring-2 ring-amber-500/60 bg-amber-500/[0.04]" : ""
      } ${isCertification ? "kanban-certification-card pr-9" : ""}`}
    >
      {isCertification && (
        <>
          <span className="kanban-certification-accent" aria-hidden="true" />
          <span className="kanban-certification-icon" title="Lead com interesse em Certificação">
            <GraduationCap className="h-4 w-4" />
          </span>
        </>
      )}
      <div className="flex items-start justify-between gap-2 mb-1">
        <Link
          to="/lead/$id"
          params={{ id: lead.id }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex flex-1 items-center gap-1 truncate text-[13px] font-semibold hover:underline"
        >
          {isHotIcp && <Flame className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          {lead.name}
        </Link>
        <Badge
          variant="outline"
          className="h-[18px] shrink-0 px-1.5 text-[10px] font-medium"
          style={{
            borderColor: PRIORITY_COLOR[lead.priority],
            color: PRIORITY_COLOR[lead.priority],
          }}
        >
          {PRIORITY_LABEL[lead.priority]}
        </Badge>
      </div>
      {lead.company_name && (
        <p className="truncate text-[12px] text-foreground/85" title={lead.company_name}>
          {lead.company_name}
        </p>
      )}
      {(lead.position || lead.company_size) && (
        <p
          className="truncate text-[11px] text-muted-foreground"
          title={[lead.position, lead.company_size].filter(Boolean).join(" · ")}
        >
          {[lead.position, lead.company_size].filter(Boolean).join(" · ")}
        </p>
      )}
      <p
        className="mt-1 truncate text-[11px] text-muted-foreground"
        title={assignedLabel ?? "Sem responsável"}
      >
        {assignedLabel ?? <span className="italic">não atribuído</span>}
      </p>
      {(() => {
        const df = resolveDemoFree(lead);
        const chips: React.ReactNode[] = [];
        if (lead.lead_type) {
          chips.push(
            <Badge
              key="type"
              variant="outline"
              className="h-[18px] px-1.5 text-[10px] font-medium"
              style={{
                borderColor: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
                color: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
              }}
            >
              {LEAD_TYPE_LABEL[lead.lead_type as LeadType]}
            </Badge>,
          );
        }
        if (df && df !== "nao") {
          chips.push(
            <Badge
              key="df"
              variant="outline"
              className={`h-[18px] px-1.5 text-[10px] font-medium ${DEMO_FREE_TONE[df]}`}
            >
              {df === "sim" ? "Demo Free" : DEMO_FREE_LABEL[df]}
            </Badge>,
          );
        }
        if (isCertification) {
          chips.push(
            <Badge
              key="cert"
              variant="outline"
              className="h-[18px] px-1.5 text-[10px] font-medium"
              style={{
                borderColor: "var(--kanban-certification-border)",
                color: "var(--kanban-certification-fg)",
                background: "var(--kanban-certification-badge-bg)",
              }}
            >
              Certificação
            </Badge>,
          );
        }
        if (!chips.length) return null;
        return <div className="mt-1.5 flex flex-wrap gap-1">{chips}</div>;
      })()}

      {stageSlug === "novo" && (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap gap-1">
            {icpFit.seniorPosition && (
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-500/40 text-emerald-600 gap-1"
              >
                <Briefcase className="h-3 w-3" /> Cargo decisor
              </Badge>
            )}
            {icpFit.bigCompany && (
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-500/40 text-emerald-600 gap-1"
              >
                <Building2 className="h-3 w-3" /> 200+ funcionários
              </Badge>
            )}
            {icpFit.score === 0 && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Sem sinais de ICP
              </Badge>
            )}
            {lead.enrichment_status === "found" && !lead.linkedin_url && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/40 text-amber-600 gap-1"
              >
                <LinkedinIcon className="h-3 w-3" /> Sem LinkedIn
              </Badge>
            )}
          </div>
          {lead.campaign && (
            <p className="text-[10px] text-muted-foreground truncate">📣 {lead.campaign}</p>
          )}
          {lead.ad_name && (
            <p className="text-[10px] text-muted-foreground truncate">🪧 {lead.ad_name}</p>
          )}
          {formEntries.length > 0 && (
            <div className="rounded bg-muted/40 p-1.5 space-y-0.5">
              {formEntries.map(([k, v]) => (
                <div key={k} className="text-[10px] truncate">
                  <span className="text-muted-foreground">{k}:</span>{" "}
                  <span className="font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
          {convertedAt && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Convertido {format(convertedAt, "dd/MM HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      )}

      {/* Playbook SDR no card: SLA de 1º atendimento e o próximo touchpoint da cadência */}
      {!["comercial", "descartado", "perdido", "desqualificado"].includes(stageSlug) && (
        <CadenceHints
          lead={lead}
          onOpen={(e) => {
            stopDrag(e);
            setShowTouches(true);
          }}
        />
      )}

      {(stageSlug === "qualificacao" || stageSlug === "em_contato") && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
          <Timer className="h-3 w-3" />
          {convertedAt && stageEnteredAt
            ? `${formatDistanceToNow(convertedAt, { locale: ptBR, addSuffix: false })} após conversão`
            : "—"}
        </div>
      )}

      {stageSlug === "aguardando" && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
          <Timer className="h-3 w-3" />
          {daysInStage != null
            ? `${daysInStage} ${daysInStage === 1 ? "dia" : "dias"} aguardando`
            : "—"}
        </div>
      )}

      {stageSlug === "agendado" && (
        <ScheduledBlock
          lead={lead}
          profiles={profiles}
          executivoIds={executivoIds}
          convertedAt={convertedAt}
          onUpdate={(patch) => onUpdate(lead.id, patch)}
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={(e) => {
            stopDrag(e);
            setShowTouches(true);
          }}
          title="Ver e registrar touches deste lead"
        >
          <Badge
            variant="secondary"
            className="text-[10px] inline-flex items-center gap-1 hover:bg-secondary/80"
          >
            <Activity className="h-3 w-3" />
            {lead.touch_count ?? 0} {(lead.touch_count ?? 0) === 1 ? "touch" : "touches"}
          </Badge>
        </button>
        {lead.last_touch_channel && (
          <span className="text-muted-foreground">
            {channelLabel(lead.last_touch_channel)}
            {lead.last_touch_outcome ? ` • ${outcomeLabel(lead.last_touch_outcome)}` : ""}
          </span>
        )}
        {lead.last_touch_at && (
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {(() => {
              const d = daysSince(lead.last_touch_at);
              return d === 0 ? "hoje" : `há ${d}d`;
            })()}
          </span>
        )}
        {lead.next_follow_up_at && (
          <>
            <span
              className={`inline-flex items-center gap-1 ${
                new Date(lead.next_follow_up_at).getTime() <= Date.now()
                  ? "text-amber-600"
                  : "text-muted-foreground"
              }`}
            >
              {new Date(lead.next_follow_up_at).getTime() <= Date.now() ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <CalendarClock className="h-3 w-3" />
              )}
              FUP {format(new Date(lead.next_follow_up_at), "dd/MM", { locale: ptBR })}
            </span>
            <button
              type="button"
              disabled={fupDone.isPending}
              onPointerDown={stopDrag}
              onClick={(e) => {
                stopDrag(e);
                fupDone.mutate();
              }}
              title="Marcar follow-up como feito"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Feito
            </button>
          </>
        )}
      </div>

      {stageSlug === "desqualificado" && (
        <div className="mt-2 text-[10px]">
          {editingReason ? (
            <div className="space-y-1" onPointerDown={stopDrag} onClick={stopDrag}>
              <select
                value={reasonOptions.includes(reasonDraft) ? reasonDraft : "__custom"}
                onChange={(e) => {
                  if (e.target.value !== "__custom") setReasonDraft(e.target.value);
                  else setReasonDraft("");
                }}
                className="w-full h-7 rounded border bg-background px-1 text-[10px]"
              >
                {reasonOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="__custom">Outro…</option>
              </select>
              {!reasonOptions.includes(reasonDraft) && (
                <Input
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  placeholder="Motivo customizado"
                  className="h-7 text-[10px]"
                />
              )}
              <div className="flex gap-1 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => {
                    setEditingReason(false);
                    setReasonDraft(lead.lost_reason ?? "");
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2"
                  disabled={!reasonDraft.trim()}
                  onClick={() => {
                    onUpdate(lead.id, { lost_reason: reasonDraft.trim() });
                    setEditingReason(false);
                  }}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => {
                stopDrag(e);
                setReasonDraft(lead.lost_reason ?? "");
                setEditingReason(true);
              }}
              className="inline-flex items-center gap-1 hover:opacity-80"
              title="Editar motivo"
            >
              <Badge variant="outline" className="text-[10px]">
                {lead.lost_reason ?? "Sem motivo"}
              </Badge>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {format(submittedAt, "dd/MM/yy HH:mm", { locale: ptBR })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-muted-foreground">{lead.score}pts</span>
          {lead.phone && (
            <button
              type="button"
              disabled={openChat.isPending}
              onPointerDown={stopDrag}
              onClick={(e) => {
                stopDrag(e);
                openChat.mutate();
              }}
              title="Abrir chat no WhatsApp"
              className="h-5 w-5 grid place-items-center rounded hover:bg-muted text-emerald-600 disabled:opacity-40"
            >
              <MessageCircle className="h-3 w-3" />
            </button>
          )}
          <div className="flex items-center" onPointerDown={stopDrag} onClick={stopDrag}>
            <button
              type="button"
              disabled={!prevStage}
              onClick={(e) => {
                stopDrag(e);
                if (prevStage) onMoveTo(lead.id, prevStage.id);
              }}
              title={prevStage ? `Mover para ${prevStage.name}` : "Sem etapa anterior"}
              className="h-5 w-5 grid place-items-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={!nextStage}
              onClick={(e) => {
                stopDrag(e);
                if (nextStage) onMoveTo(lead.id, nextStage.id);
              }}
              title={nextStage ? `Mover para ${nextStage.name}` : "Sem próxima etapa"}
              className="h-5 w-5 grid place-items-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      {/* unused but keep referenced to avoid lint */}
      <span className="hidden">{sinceConversion}</span>
      {showTouches && (
        <TouchSequenceModal
          leadId={lead.id}
          leadName={lead.name}
          onClose={() => setShowTouches(false)}
        />
      )}
    </Card>
  );
  if (overlay) return content;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      {content}
    </div>
  );
}

/**
 * SLA de 1º atendimento (15 min) e próximo touchpoint do playbook. O "feito"
 * é aproximado pelo nº de touches registrados (os passos são feitos em ordem);
 * o modal traz o plano exato e o script de cada passo.
 */
function CadenceHints({ lead, onOpen }: { lead: KanbanLead; onOpen: (e: SyntheticEvent) => void }) {
  const touches = lead.touch_count ?? 0;
  const sla = evaluateSla({
    createdAt: lead.created_at,
    convertedAt: lead.converted_at,
    firstTouchAt: lead.first_approach_at ?? (touches > 0 ? lead.last_touch_at : null),
  });
  const track = resolveTrack({
    company_size: lead.company_size,
    linkedin_company_size: lead.linkedin_company_size,
    lead_type: lead.lead_type,
    cadence_track: lead.cadence_track,
  });
  const startAt = lead.cadence_started_at ?? lead.converted_at ?? lead.created_at;
  const plan = startAt ? buildCadencePlan({ track, startAt, doneMap: {} }) : null;
  const next = plan ? (plan.steps[Math.min(touches, plan.steps.length - 1)] ?? null) : null;
  const finished = !!plan && touches >= plan.steps.length;
  const showSla = sla.status !== "sem_dado" && (sla.status !== "ok" || touches === 0);
  if (!showSla && (!next || finished)) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {showSla && (
        <Badge
          variant="outline"
          className={`gap-1 text-[10px] ${
            sla.status === "estourado"
              ? "border-red-500/50 text-red-600"
              : sla.status === "pendente"
                ? "border-amber-500/50 text-amber-600"
                : "border-emerald-500/40 text-emerald-600"
          }`}
          title="SLA de primeiro atendimento: 15 minutos da conversão até o primeiro touch"
        >
          <Timer className="h-3 w-3" /> SLA {sla.minutes} min
          {sla.status === "estourado"
            ? " · estourado"
            : sla.status === "pendente"
              ? " · sem touch"
              : ""}
        </Badge>
      )}
      {next && !finished && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onOpen}
          title={`${TRACK_LABEL[track]} · ${next.channelTag} · abrir cadência e script`}
          className="min-w-0"
        >
          <Badge
            variant="outline"
            className={`max-w-full gap-1 truncate text-[10px] ${
              next.status === "atrasado"
                ? "border-red-500/50 text-red-600"
                : next.status === "hoje"
                  ? "border-primary/50 text-primary"
                  : "text-muted-foreground"
            }`}
          >
            <Activity className="h-3 w-3 shrink-0" />
            <span className="truncate">
              D{next.day} {next.period === "manha" ? "M" : "T"} · {next.channelTag} · {next.title}
            </span>
            {next.status === "atrasado" ? " · atrasado" : next.status === "hoje" ? " · hoje" : ""}
          </Badge>
        </button>
      )}
    </div>
  );
}

/**
 * Card na etapa "Agendado": data da reunião (editável), quando a agenda foi
 * marcada (carimbo automático ao definir a data) e o executivo do comercial
 * que vai fazer a reunião.
 */
function ScheduledBlock({
  lead,
  profiles,
  executivoIds,
  convertedAt,
  onUpdate,
}: {
  lead: KanbanLead;
  profiles: { id: string; full_name: string | null; email: string | null }[];
  executivoIds: string[];
  convertedAt: Date | null;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const meetingAt = lead.meeting_at ? new Date(lead.meeting_at) : null;
  const bookedAt = lead.meeting_booked_at
    ? new Date(lead.meeting_booked_at)
    : lead.stage_entered_at
      ? new Date(lead.stage_entered_at)
      : null;
  const toLocal = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [draft, setDraft] = useState(meetingAt ? toLocal(meetingAt) : "");
  const executivos = profiles.filter((p) => executivoIds.includes(p.id));
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div className="mt-2 space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-1.5">
      {editing ? (
        <div className="flex items-center gap-1" onPointerDown={stop} onClick={stop}>
          <input
            type="datetime-local"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-6 flex-1 rounded border bg-background px-1 text-[10px]"
          />
          <button
            type="button"
            className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"
            onClick={() => {
              if (draft) onUpdate({ meeting_at: new Date(draft).toISOString() });
              setEditing(false);
            }}
          >
            ok
          </button>
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            setEditing(true);
          }}
          title="Alterar data da reunião"
          className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:underline"
        >
          <Calendar className="h-3 w-3" />
          {meetingAt
            ? `Reunião: ${format(meetingAt, "dd/MM HH:mm", { locale: ptBR })}`
            : "Definir data da reunião"}
        </button>
      )}
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        {bookedAt ? `Marcada em ${format(bookedAt, "dd/MM HH:mm", { locale: ptBR })}` : "Marcada em —"}
        {convertedAt && bookedAt
          ? ` · ${formatDistanceToNow(convertedAt, { locale: ptBR })} após conversão`
          : ""}
      </p>
      <label className="flex items-center gap-1 text-[10px] text-muted-foreground" onPointerDown={stop} onClick={stop}>
        <UserIcon className="h-3 w-3 shrink-0" />
        <select
          value={lead.executivo_id ?? ""}
          onChange={(e) => onUpdate({ executivo_id: e.target.value || null })}
          className="h-6 min-w-0 flex-1 rounded border bg-background px-1 text-[10px] text-foreground"
          title="Executivo do comercial que vai fazer a reunião"
        >
          <option value="">Executivo: a definir</option>
          {executivos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email || p.id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function LostReasonDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (reason: string) => void;
}) {
  const reasons = [
    "Sem perfil",
    "Sem fit com soluções",
    "Sem contato",
    "Sem orçamento",
    "Timing inadequado",
    "Concorrência",
  ];
  const [selected, setSelected] = useState<string>(reasons[0]);
  const [custom, setCustom] = useState("");
  const isOther = selected === "__other";
  const finalReason = isOther ? custom.trim() : selected;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Motivo de desqualificação</h2>
        <p className="text-xs text-muted-foreground mb-4">Escolha o motivo para mover este lead.</p>
        <div className="space-y-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="__other">Outros…</option>
          </select>
          {isOther && (
            <Input
              placeholder="Descreva o motivo"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!finalReason} onClick={() => onPick(finalReason)}>
            Salvar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function NewLeadDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (d: {
    name: string;
    email: string;
    phone: string;
    company_name: string;
    position: string;
    source: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company_name: "",
    position: "",
    source: "manual",
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Novo lead manual</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="space-y-3"
        >
          <Input
            placeholder="Nome *"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="WhatsApp"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            placeholder="Empresa"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          />
          <Input
            placeholder="Cargo"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
          />
          <Input
            placeholder="Origem"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Criar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
