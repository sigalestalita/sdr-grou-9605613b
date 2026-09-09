import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteCsFeatureOffer,
  getCsFeatures,
  saveCsFeatureOffer,
} from "@/lib/cs-features.functions";
import { Lightbulb, Puzzle, Trash2 } from "lucide-react";

const STATUS_LABEL = { oferecida: "Oferecida", adotada: "Adotada", recusada: "Recusada" } as const;
const fmt = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

/** Funcionalidades da plataforma: o que oferecer agora e o histórico de ofertas. */
export function CsFeaturesPanel({ clientUid }: { clientUid: string }) {
  const getFn = useServerFn(getCsFeatures);
  const saveFn = useServerFn(saveCsFeatureOffer);
  const delFn = useServerFn(deleteCsFeatureOffer);
  const qc = useQueryClient();
  const key = ["cs-features", clientUid];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { clientUid } }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
  };
  const [form, setForm] = useState<null | { featureId: string; status: "oferecida" | "adotada" | "recusada"; offeredAt: string; note: string }>(null);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { clientUid, ...form!, note: form!.note || null } }),
    onSuccess: () => {
      toast.success("Registrado");
      setForm(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const del = useMutation({ mutationFn: (id: string) => delFn({ data: { id } }), onSuccess: refresh });

  if (q.isLoading || !q.data) return <p className="text-[12px] text-muted-foreground">Carregando…</p>;
  const d = q.data;
  const open = (featureId: string, status: "oferecida" | "adotada" | "recusada" = "oferecida") =>
    setForm({ featureId, status, offeredAt: new Date().toISOString().slice(0, 10), note: "" });

  return (
    <div className="space-y-3 text-[12px]">
      {d.suggestions.length > 0 ? (
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
          <p className="flex items-center gap-1 font-medium">
            <Lightbulb className="h-3.5 w-3.5 text-primary" /> Oferecer agora
          </p>
          {d.suggestions.map((s) => (
            <div key={s.featureId} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{s.nome}</p>
                <p className="text-[11px] text-muted-foreground">{s.motivo} — {s.gancho}</p>
              </div>
              <button type="button" onClick={() => open(s.featureId)} className="shrink-0 text-[11px] text-primary hover:underline">
                registrar oferta
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Nenhuma funcionalidade indicada agora
          {d.pessoasMapeadas == null ? " — informe “pessoas mapeadas” em Sobre esta empresa para Tendências de Grupo" : ""}.
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {d.catalog.map((f) => (
          <button key={f.id} type="button" onClick={() => open(f.id)} title={f.resolve} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
            + {f.nome}
          </button>
        ))}
      </div>
      {form && (
        <div className="space-y-2 rounded-md border p-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.featureId} onChange={(e) => setForm({ ...form, featureId: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs">
              {d.catalog.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as never })} className="h-8 rounded-md border bg-background px-2 text-xs">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Input type="date" className="h-8 text-xs" value={form.offeredAt} onChange={(e) => setForm({ ...form, offeredAt: e.target.value })} />
            <Input className="h-8 text-xs" placeholder="Observação" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setForm(null)}>Cancelar</Button>
            <Button size="sm" className="h-7" disabled={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          </div>
        </div>
      )}
      {d.offers.length > 0 && (
        <ul className="divide-y">
          {d.offers.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate"><Puzzle className="mr-1 inline h-3 w-3 text-muted-foreground" />{o.featureName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {STATUS_LABEL[o.status]} · {fmt(o.offeredAt)}{o.note ? ` · ${o.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {o.status === "oferecida" && (
                  <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setForm({ featureId: o.featureId, status: "adotada", offeredAt: new Date().toISOString().slice(0, 10), note: "" })}>
                    adotou
                  </button>
                )}
                <button type="button" onClick={() => del.mutate(o.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
