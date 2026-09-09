import { useEffect, useState } from "react";
import { parseCsvClients } from "@/lib/cs-import";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importCsClients, saveCsSettings } from "@/lib/cs.functions";
import {
  DEFAULT_HEALTH_WEIGHTS,
  DEFAULT_ROUTING,
  DEFAULT_STAGE_SLA,
  type HealthWeights,
  type RoutingConfig,
  type StageSla,
} from "@/lib/cs-types";
import { Save, Upload } from "lucide-react";

type Profile = { id: string; full_name: string | null; email: string | null };

const TABS = ["health", "sla", "roteamento", "importar"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  health: "Health score",
  sla: "SLA da jornada",
  roteamento: "Roteamento",
  importar: "Importar carteira",
};

/** Configurações do módulo de CS em abas — cada aba edita uma chave de cs_settings. */
export function CsSettingsPanel({
  profiles,
  weights,
  sla,
  routing,
  onSaved,
}: {
  profiles: Profile[];
  weights?: HealthWeights;
  sla?: StageSla;
  routing?: RoutingConfig;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveCsSettings);
  const importFn = useServerFn(importCsClients);
  const [tab, setTab] = useState<Tab>("health");

  const [w, setW] = useState<HealthWeights>(weights ?? DEFAULT_HEALTH_WEIGHTS);
  const [s, setS] = useState<StageSla>(sla ?? DEFAULT_STAGE_SLA);
  const [r, setR] = useState<RoutingConfig>(routing ?? DEFAULT_ROUTING);
  useEffect(() => {
    if (weights) setW(weights);
  }, [weights]);
  useEffect(() => {
    if (sla) setS(sla);
  }, [sla]);
  useEffect(() => {
    if (routing) setR(routing);
  }, [routing]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { weights: w, sla: s, routing: r } }),
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
  const weightOk = totalWeight === 100;

  const toggleList = (key: "cs_round_robin" | "comercial_high", id: string) =>
    setR((cur) => ({
      ...cur,
      [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id],
    }));

  const SaveBar = () => (
    <div className="flex items-center justify-end gap-3 border-t pt-3">
      {tab === "health" && (
        <span className={`text-[12px] ${weightOk ? "text-success" : "text-warning"}`}>
          Soma dos pesos: {totalWeight}
          {weightOk ? " ✓" : " — o ideal é 100"}
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
              O score é a média ponderada dos sinais de engajamento do cliente — engajamento, não
              resultado. Ajuste os pesos para que a soma seja 100.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(w) as Array<keyof HealthWeights>).map((k) => (
                <label key={k} className="block space-y-1">
                  <span className="text-xs text-muted-foreground">{WEIGHT_LABEL[k]}</span>
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
            <SaveBar />
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
            <SaveBar />
          </>
        )}

        {tab === "roteamento" && (
          <>
            <p className="max-w-[70ch] text-[13px] text-muted-foreground">
              Quem assume cada cliente novo. O porte (corte de aporte) decide se o comercial fica
              com o próprio CS ou vai para o pool de executivos.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Corte de aporte (R$)</span>
                <Input
                  type="number"
                  value={r.aporte_threshold}
                  onChange={(e) => setR({ ...r, aporte_threshold: Number(e.target.value) })}
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
                Comercial para contas acima do corte de aporte
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
            <SaveBar />
          </>
        )}

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

const WEIGHT_LABEL: Record<keyof HealthWeights, string> = {
  sinaleira_pda: "Sinaleira PDA",
  agenda_90d: "Agendas em 90 dias",
  whatsapp_respondido: "WhatsApp respondido",
  email_respondido: "E-mail respondido",
  uso_plataforma_cs: "Uso da plataforma",
};

const SLA_LABEL: Record<keyof StageSla, string> = {
  onboarding: "Onboarding",
  ativacao: "Ativação",
  renovacao: "Renovação",
  sem_contato_dias: "Sem contato (dias)",
};
