import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getLeadCadence, saveLeadBant } from "@/lib/sdr-cadence.functions";
import {
  BANT_GUIDE,
  BANT_STATUS,
  BANT_STATUS_LABEL,
  type BantStatus,
  type LeadBant,
} from "@/lib/sdr-playbook";
import { ClipboardCheck, AlertTriangle, Check } from "lucide-react";

const TONE: Record<BantStatus, string> = {
  nao_avaliado: "border-border text-muted-foreground",
  ok: "border-emerald-500/50 text-emerald-600",
  parcial: "border-amber-500/50 text-amber-600",
  bloqueio: "border-destructive/50 text-destructive",
};

type Draft = Record<string, { status: BantStatus; notes: string }>;

const emptyDraft = (): Draft =>
  Object.fromEntries(BANT_GUIDE.map((g) => [g.key, { status: "nao_avaliado" as BantStatus, notes: "" }]));

export function BantPanel({ leadId }: { leadId: string }) {
  const getFn = useServerFn(getLeadCadence);
  const saveFn = useServerFn(saveLeadBant);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [summary, setSummary] = useState("");

  const { data } = useQuery({
    queryKey: ["lead-cadence", leadId],
    queryFn: () => getFn({ data: { leadId } }),
  });

  useEffect(() => {
    const bant = (data?.bant ?? {}) as LeadBant;
    const next = emptyDraft();
    for (const g of BANT_GUIDE) {
      const cur = bant[g.key];
      if (cur) next[g.key] = { status: cur.status ?? "nao_avaliado", notes: cur.notes ?? "" };
    }
    setDraft(next);
    setSummary(bant.summary ?? "");
  }, [data?.bant]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          leadId,
          bant: {
            budget: draft["budget"],
            authority: draft["authority"],
            need: draft["need"],
            timeline: draft["timeline"],
            summary: summary.trim(),
          },
        },
      }),
    onSuccess: () => {
      toast.success("BANT registrado");
      qc.invalidateQueries({ queryKey: ["lead-cadence", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const evaluated = BANT_GUIDE.filter((g) => draft[g.key]?.status !== "nao_avaliado").length;
  const blockers = BANT_GUIDE.filter((g) => draft[g.key]?.status === "bloqueio");
  const ready = evaluated === BANT_GUIDE.length && blockers.length === 0;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Qualificação BANT
          </h2>
          <p className="text-xs text-muted-foreground">
            Registro obrigatório antes da passagem de bastão ao especialista.
          </p>
        </div>
        <Badge variant="outline" className={ready ? "border-emerald-500/50 text-emerald-600" : ""}>
          {evaluated}/{BANT_GUIDE.length} avaliados
        </Badge>
      </div>

      {blockers.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
          <span>
            Bloqueio em {blockers.map((b) => b.label.split(" — ")[0]).join(", ")}. Considere descarte motivado ou
            nutrição em vez de agendar reunião.
          </span>
        </div>
      )}
      {ready && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-600 flex items-center gap-2">
          <Check className="h-3.5 w-3.5" /> BANT completo — lead pronto para agendamento com o especialista.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {BANT_GUIDE.map((g) => {
          const cur = draft[g.key] ?? { status: "nao_avaliado" as BantStatus, notes: "" };
          return (
            <div key={g.key} className={`rounded-lg border p-3 space-y-2 ${TONE[cur.status]}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{g.label}</p>
                <select
                  value={cur.status}
                  onChange={(e) =>
                    setDraft({ ...draft, [g.key]: { ...cur, status: e.target.value as BantStatus } })
                  }
                  className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                >
                  {BANT_STATUS.map((s) => (
                    <option key={s} value={s}>{BANT_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-muted-foreground">{g.focus}</p>
              <ul className="space-y-1">
                {g.questions.map((q) => (
                  <li key={q} className="text-[11px] text-muted-foreground">• {q}</li>
                ))}
              </ul>
              <Textarea
                rows={2}
                placeholder="Resposta do lead"
                value={cur.notes}
                onChange={(e) => setDraft({ ...draft, [g.key]: { ...cur, notes: e.target.value } })}
              />
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Resumo BANT para a passagem de bastão</label>
        <Textarea
          rows={3}
          placeholder="Contexto do lead, dores mapeadas, quem decide e prazo — vai no corpo do convite da reunião."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : "Salvar BANT"}
        </Button>
      </div>
    </Card>
  );
}
