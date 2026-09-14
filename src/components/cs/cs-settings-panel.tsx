import { useEffect, useMemo, useState } from "react";
import { parseCsvClients } from "@/lib/cs-import";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteCsDelegation,
  importCsClients,
  listCsDelegations,
  saveCsDelegation,
  saveCsSettings,
} from "@/lib/cs.functions";
import {
  CS_TASK_TYPES,
  CS_TASK_TYPE_LABEL,
  DEFAULT_DAILY_TARGET,
  DEFAULT_ESCALATION_CONFIG,
  DEFAULT_EVIDENCE_CONFIG,
  DEFAULT_HEALTH_OPTIONS,
  DEFAULT_HEALTH_SIGNAL_POINTS,
  DEFAULT_HEALTH_WEIGHTS,
  DEFAULT_ROUTING,
  DEFAULT_STAGE_SLA,
  HEALTH_CRITERIA_LABEL,
  type CsTaskType,
  type DailyTarget,
  type EscalationConfig,
  type EvidenceConfig,
  type HealthOptions,
  type HealthSignalPoints,
  type HealthWeights,
  type RoutingConfig,
  type StageSla,
} from "@/lib/cs-types";
import { fmtDate } from "@/components/cs/cs-client-sections";
import { MasterclassSettings } from "@/components/cs/cs-masterclass-settings";
import { DEFAULT_MASTERCLASS_CONFIG, type MasterclassConfig } from "@/lib/cs/masterclass";
import { JourneySettings } from "@/components/cs/cs-journey-settings";
import { DEFAULT_JOURNEY_CONFIG, type JourneyConfig } from "@/lib/cs/journey";
import { Plus, Save, Trash2, Upload } from "lucide-react";

type Profile = { id: string; full_name: string | null; email: string | null };

const TABS = [
  "health",
  "metas",
  "evidencia",
  "masterclass",
  "jornadas",
  "sla",
  "roteamento",
  "carteira",
  "importar",
] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  health: "Health score",
  metas: "Metas",
  evidencia: "Tarefas e evidência",
  masterclass: "Masterclasses",
  jornadas: "Jornadas Reais",
  sla: "SLA da jornada",
  roteamento: "Roteamento",
  carteira: "Carteira e delegações",
  importar: "Importar carteira",
};

/** Configurações do módulo de CS em abas — cada aba edita uma chave de cs_settings. */
export function CsSettingsPanel({
  profiles,
  weights,
  signalPoints,
  options,
  dailyTarget,
  evidence,
  escalation,
  masterclass,
  journey,
  sla,
  routing,
  onSaved,
}: {
  profiles: Profile[];
  weights?: HealthWeights;
  signalPoints?: HealthSignalPoints;
  options?: HealthOptions;
  dailyTarget?: DailyTarget;
  evidence?: EvidenceConfig;
  escalation?: EscalationConfig;
  masterclass?: MasterclassConfig;
  journey?: JourneyConfig;
  sla?: StageSla;
  routing?: RoutingConfig;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveCsSettings);
  const importFn = useServerFn(importCsClients);
  const [tab, setTab] = useState<Tab>("health");

  const [w, setW] = useState<HealthWeights>(weights ?? DEFAULT_HEALTH_WEIGHTS);
  const [pts, setPts] = useState<HealthSignalPoints>(signalPoints ?? DEFAULT_HEALTH_SIGNAL_POINTS);
  const [opt, setOpt] = useState<HealthOptions>(options ?? DEFAULT_HEALTH_OPTIONS);
  const [meta, setMeta] = useState<DailyTarget>(dailyTarget ?? DEFAULT_DAILY_TARGET);
  const [ev, setEv] = useState<EvidenceConfig>(evidence ?? DEFAULT_EVIDENCE_CONFIG);
  const [esc, setEsc] = useState<EscalationConfig>(escalation ?? DEFAULT_ESCALATION_CONFIG);
  const [mc, setMc] = useState<MasterclassConfig>(masterclass ?? DEFAULT_MASTERCLASS_CONFIG);
  const [jour, setJour] = useState<JourneyConfig>(journey ?? DEFAULT_JOURNEY_CONFIG);
  const [s, setS] = useState<StageSla>(sla ?? DEFAULT_STAGE_SLA);
  const [r, setR] = useState<RoutingConfig>(routing ?? DEFAULT_ROUTING);
  useEffect(() => {
    if (weights) setW(weights);
  }, [weights]);
  useEffect(() => {
    if (signalPoints) setPts(signalPoints);
  }, [signalPoints]);
  useEffect(() => {
    if (options) setOpt(options);
  }, [options]);
  useEffect(() => {
    if (dailyTarget) setMeta(dailyTarget);
  }, [dailyTarget]);
  useEffect(() => {
    if (evidence) setEv(evidence);
  }, [evidence]);
  useEffect(() => {
    if (escalation) setEsc(escalation);
  }, [escalation]);
  useEffect(() => {
    if (masterclass) setMc(masterclass);
  }, [masterclass]);
  useEffect(() => {
    if (journey) setJour(journey);
  }, [journey]);
  useEffect(() => {
    if (sla) setS(sla);
  }, [sla]);
  useEffect(() => {
    if (routing) setR(routing);
  }, [routing]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          weights: w,
          signalPoints: pts,
          options: opt,
          dailyTarget: meta,
          evidence: ev,
          escalation: esc,
          masterclass: mc,
          journey: jour,
          sla: s,
          routing: r,
        },
      }),
    onSuccess: () => {
      toast.success("Configurações de CS salvas");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const [csv, setCsv] = useState("");
  const importer = useMutation({
    mutationFn: () => importFn({ data: { rows: parseCsvClients(csv), autoRoute: true } }),
    onSuccess: (res) => {
      toast.success(
        `${res.created} criado(s), ${res.skipped} já existiam, ${res.linked} vinculado(s) à consultoria`,
      );
      setCsv("");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
  const pointsOk = pts.verde <= w.sinaleira && pts.amarelo <= w.sinaleira;

  const toggleList = (key: "cs_round_robin" | "comercial_high", id: string) =>
    setR((cur) => ({
      ...cur,
      [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id],
    }));

  const saveBar = (
    <div className="flex items-center justify-end gap-3 border-t pt-3">
      {tab === "health" && (
        <span className={`text-[12px] ${pointsOk ? "text-muted-foreground" : "text-warning"}`}>
          Soma dos pesos: {totalWeight} — o score é normalizado sobre a soma
          {!pointsOk && " · pontos por cor não podem passar do peso da sinaleira"}
        </span>
      )}
      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        <Save className="mr-1 h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );

  return (
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

      <div className="space-y-4 p-4">
        {tab === "health" && (
          <>
            <p className="max-w-[70ch] text-[13px] text-muted-foreground">
              O score mede engajamento, não resultado. A sinaleira contribui com pontos por cor; os
              demais critérios valem o peso inteiro quando presentes.
            </p>
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div>
                <p className="section-label mb-2">Pesos</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(Object.keys(w) as Array<keyof HealthWeights>).map((k) => (
                    <label key={k} className="block space-y-1">
                      <span className="text-xs text-muted-foreground">
                        {HEALTH_CRITERIA_LABEL[k]}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={w[k]}
                        onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="section-label mb-2">Pontos por cor da sinaleira</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["verde", "amarelo", "vermelho"] as const).map((c) => (
                      <label key={c} className="block space-y-1">
                        <span className="text-xs capitalize text-muted-foreground">{c}</span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={pts[c]}
                          onChange={(e) => setPts({ ...pts, [c]: Number(e.target.value) })}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preto (licença vencida) fica fora do cálculo e entra na fila de reativação.
                  </p>
                </div>
                <label className="flex items-start gap-2 rounded-md border p-2.5 text-[12px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={opt.renormalizar_sem_sinaleira}
                    onChange={(e) =>
                      setOpt({ ...opt, renormalizar_sem_sinaleira: e.target.checked })
                    }
                  />
                  <span>
                    <b className="font-medium">Renormalizar cliente sem sinaleira.</b>{" "}
                    <span className="text-muted-foreground">
                      Certificação, DG e compra avulsa são pontuados de 0 a 100 sobre os critérios
                      restantes, em vez de perderem os {w.sinaleira} pontos da sinaleira.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            {saveBar}
          </>
        )}

        {tab === "metas" && (
          <>
            <p className="max-w-[70ch] text-[13px] text-muted-foreground">
              Volume mínimo de contatos por analista, por dia. Aparece no Início e no Kanban semanal
              como "n de {meta.contatos_por_dia} hoje".
            </p>
            <label className="block max-w-xs space-y-1">
              <span className="text-xs text-muted-foreground">Contatos por dia (por analista)</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={meta.contatos_por_dia}
                onChange={(e) => setMeta({ contatos_por_dia: Number(e.target.value) })}
              />
            </label>
            {saveBar}
          </>
        )}

        {tab === "evidencia" && (
          <>
            <p className="max-w-[80ch] text-[13px] text-muted-foreground">
              Tarefas dos canais marcados não têm check manual: são concluídas pelo próprio registro
              do canal — o e-mail enviado pela caixa vinculada ou a mensagem enviada pelo WhatsApp
              do CS. Cada envio também atualiza o "último contato" da empresa e a ação de cadência
              da semana.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ev.exigir_evidencia}
                onChange={(e) => setEv({ ...ev, exigir_evidencia: e.target.checked })}
              />
              Exigir evidência do canal para concluir tarefas
            </label>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Canais com evidência obrigatória</p>
              <div className="flex flex-wrap gap-1.5">
                {CS_TASK_TYPES.filter((t) => t !== "outro").map((t) => {
                  const on = ev.canais.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!ev.exigir_evidencia}
                      onClick={() =>
                        setEv({
                          ...ev,
                          canais: on
                            ? ev.canais.filter((c) => c !== t)
                            : ([...ev.canais, t] as CsTaskType[]),
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${
                        on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      {CS_TASK_TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Reunião vem da agenda vinculada (Google/Calendly) quando o convite tem um contato da
                empresa. Ligação não tem registro automático — se marcada, só a gestão conclui.
              </p>
            </div>
            <div className="grid max-w-lg gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Antecedência (h): um envio conclui tarefas que vencem em até
                </span>
                <Input
                  type="number"
                  min={0}
                  max={720}
                  value={ev.antecedencia_horas}
                  onChange={(e) => setEv({ ...ev, antecedencia_horas: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Retroativo (h): ao registrar resultado, aceita envio feito há até
                </span>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={ev.retroativo_horas}
                  onChange={(e) => setEv({ ...ev, retroativo_horas: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ev.gestor_pode_concluir}
                onChange={(e) => setEv({ ...ev, gestor_pode_concluir: e.target.checked })}
              />
              Gestão pode concluir tarefa de canal com justificativa
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ev.conta_bot}
                onChange={(e) => setEv({ ...ev, conta_bot: e.target.checked })}
              />
              Mensagens de automação/IA no WhatsApp contam como envio do time
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ev.reuniao_exige_aceite}
                onChange={(e) => setEv({ ...ev, reuniao_exige_aceite: e.target.checked })}
              />
              Reunião da Google Agenda só conta se o contato aceitou o convite
            </label>

            <div className="space-y-3 border-t pt-4">
              <div>
                <h3 className="text-sm font-semibold">Escalação ao gestor</h3>
                <p className="max-w-[80ch] text-[13px] text-muted-foreground">
                  Tarefas, ações de cadência, próximos passos de reunião e tratativas de alerta que
                  passarem do limite aparecem para a gestão no Início e no Dashboard CS, e por
                  e-mail uma vez por dia. "Sem ação" = nenhum contato registrado com a empresa desde
                  que a ação venceu.
                </p>
              </div>
              <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Escalar após (dias de atraso)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={esc.dias_atraso}
                    onChange={(e) => setEsc({ ...esc, dias_atraso: Number(e.target.value) })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Sem ação: escalar após (dias)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={esc.dias_sem_acao}
                    onChange={(e) => setEsc({ ...esc, dias_sem_acao: Number(e.target.value) })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Critério</span>
                  <select
                    value={esc.criterio}
                    onChange={(e) =>
                      setEsc({ ...esc, criterio: e.target.value as EscalationConfig["criterio"] })
                    }
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="qualquer">Atraso OU sem ação</option>
                    <option value="ambos">Atraso E sem ação</option>
                    <option value="atraso">Só atraso</option>
                    <option value="sem_acao">Só sem ação</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={esc.notificar_email}
                  onChange={(e) => setEsc({ ...esc, notificar_email: e.target.checked })}
                />
                Avisar a gestão por e-mail (diário)
              </label>
              <label className="block max-w-2xl space-y-1">
                <span className="text-xs text-muted-foreground">
                  E-mails da diretoria (além da gestão), separados por vírgula — recebem a lista
                  mensal "vermelho 6+ meses".
                </span>
                <Input
                  value={(esc.diretoria_emails ?? []).join(", ")}
                  onChange={(e) =>
                    setEsc({
                      ...esc,
                      diretoria_emails: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="diretoria@grougp.com.br, admin@grougp.com.br"
                />
              </label>
            </div>
            {saveBar}
          </>
        )}

        {tab === "masterclass" && (
          <>
            <MasterclassSettings value={mc} onChange={setMc} />
            {saveBar}
          </>
        )}

        {tab === "jornadas" && (
          <>
            <JourneySettings value={jour} onChange={setJour} />
            {saveBar}
          </>
        )}

        {tab === "sla" && (
          <>
            <p className="max-w-[70ch] text-[13px] text-muted-foreground">
              Dias máximos em cada etapa da jornada (2 · 8 · 2 meses no padrão) e o limite de dias
              sem contato que gera alerta.
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              {(Object.keys(s) as Array<keyof StageSla>).map((k) => (
                <label key={k} className="block space-y-1">
                  <span className="text-xs text-muted-foreground">{SLA_LABEL[k]}</span>
                  <Input
                    type="number"
                    min={1}
                    value={s[k]}
                    onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            {saveBar}
          </>
        )}

        {tab === "roteamento" && (
          <>
            <p className="max-w-[70ch] text-[13px] text-muted-foreground">
              Quem assume cada cliente novo. O <strong>porte</strong> (faixa de funcionários do RD,
              "[Grou] Porte") decide se o comercial fica com o próprio CS ou vai para o pool de
              executivos.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">
                  Corte de porte (nº de funcionários a partir do qual vai para executivo)
                </span>
                <Input
                  type="number"
                  min={1}
                  value={r.porte_min_funcionarios}
                  onChange={(e) => setR({ ...r, porte_min_funcionarios: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">CS de consultorias</span>
                <select
                  value={r.consultoria_cs ?? ""}
                  onChange={(e) => setR({ ...r, consultoria_cs: e.target.value || null })}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">CS de renovação</span>
                <select
                  value={r.renovacao_cs ?? ""}
                  onChange={(e) => setR({ ...r, renovacao_cs: e.target.value || null })}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Roleta de CS (empresas)</p>
              <div className="flex flex-wrap gap-1">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleList("cs_round_robin", p.id)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      r.cs_round_robin.includes(p.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {p.full_name || p.email}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Comercial para contas a partir do corte de porte
              </p>
              <div className="flex flex-wrap gap-1">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleList("comercial_high", p.id)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      r.comercial_high.includes(p.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {p.full_name || p.email}
                  </button>
                ))}
              </div>
            </div>
            {saveBar}
          </>
        )}

        {tab === "carteira" && <DelegationsTab profiles={profiles} />}

        {tab === "importar" && (
          <>
            <p className="max-w-[80ch] text-[13px] text-muted-foreground">
              Cole o CSV (separado por ; ou ,) com cabeçalho. Colunas aceitas: nome_empresa, cnpj,
              parent_nome, tipo_lead, origem, aporte_valor, login_pda, linkedin_url, site_url,
              data_inicio_contrato, data_renovacao, cs_responsavel_email,
              comercial_responsavel_email. Empresas já existentes são ignoradas e o código de 4
              caracteres é gerado automaticamente.
            </p>
            <textarea
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="nome_empresa;tipo_lead;origem;aporte_valor;data_renovacao"
              className="w-full rounded-md border bg-background p-2 font-mono text-xs"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {csv.trim()
                  ? `${Math.max(parseCsvClients(csv).length, 0)} linha(s) válida(s)`
                  : "Nenhuma linha"}
              </span>
              <Button
                size="sm"
                disabled={importer.isPending || !csv.trim()}
                onClick={() => importer.mutate()}
              >
                <Upload className="mr-1 h-4 w-4" />
                {importer.isPending ? "Importando…" : "Importar clientes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Quem cobre a carteira de quem, e até quando. Gestão cria para qualquer pessoa; analista só para si. */
function DelegationsTab({ profiles }: { profiles: Profile[] }) {
  const listFn = useServerFn(listCsDelegations);
  const saveFn = useServerFn(saveCsDelegation);
  const delFn = useServerFn(deleteCsDelegation);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["cs-delegations"], queryFn: () => listFn({}) });
  const name = useMemo(() => {
    const m = new Map(profiles.map((p) => [p.id, p.full_name || p.email || p.id]));
    return (id: string) => m.get(id) ?? id;
  }, [profiles]);

  const [form, setForm] = useState({
    from_user_id: "",
    to_user_id: "",
    starts_at: new Date().toISOString().slice(0, 10),
    ends_at: "",
    reason: "",
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["cs-delegations"] });
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          from_user_id: form.from_user_id,
          to_user_id: form.to_user_id,
          starts_at: form.starts_at,
          ends_at: form.ends_at || null,
          reason: form.reason || null,
        },
      }),
    onSuccess: () => {
      toast.success("Delegação criada");
      setForm({ ...form, to_user_id: "", ends_at: "", reason: "" });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Delegação removida");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const isActive = (d: { starts_at: string; ends_at: string | null }) =>
    d.starts_at <= today && (!d.ends_at || d.ends_at >= today);

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-[13px] text-muted-foreground">
        Cada pessoa enxerga a própria carteira. Uma delegação dá a quem cobre acesso à carteira de
        quem está fora, pelo período informado. A gestão sempre vê tudo.
      </p>

      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-5">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Carteira de</span>
          <select
            value={form.from_user_id}
            onChange={(e) => setForm({ ...form, from_user_id: e.target.value })}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Coberta por</span>
          <select
            value={form.to_user_id}
            onChange={(e) => setForm({ ...form, to_user_id: e.target.value })}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">De</span>
          <Input
            type="date"
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Até (opcional)</span>
          <Input
            type="date"
            value={form.ends_at}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
          />
        </label>
        <div className="flex items-end">
          <Button
            size="sm"
            className="w-full"
            disabled={
              save.isPending ||
              !form.from_user_id ||
              !form.to_user_id ||
              form.from_user_id === form.to_user_id
            }
            onClick={() => save.mutate()}
          >
            <Plus className="mr-1 h-4 w-4" /> Delegar
          </Button>
        </div>
        <Input
          className="sm:col-span-5"
          placeholder="Motivo (férias, afastamento…)"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma delegação cadastrada.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Carteira de</th>
              <th>Coberta por</th>
              <th>Período</th>
              <th>Motivo</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id}>
                <td>{name(d.from_user_id)}</td>
                <td>{name(d.to_user_id)}</td>
                <td className="whitespace-nowrap">
                  {fmtDate(d.starts_at)} → {d.ends_at ? fmtDate(d.ends_at) : "sem fim"}
                </td>
                <td className="text-muted-foreground">{d.reason || "—"}</td>
                <td>
                  <span
                    className={`text-[11px] ${isActive(d) ? "text-success" : "text-muted-foreground"}`}
                  >
                    {isActive(d) ? "ativa" : d.starts_at > today ? "agendada" : "encerrada"}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    title="Remover"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(d.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SLA_LABEL: Record<keyof StageSla, string> = {
  onboarding: "Onboarding",
  ativacao: "Ativação",
  renovacao: "Renovação",
  sem_contato_dias: "Sem contato (dias)",
};
