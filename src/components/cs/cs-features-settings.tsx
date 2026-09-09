import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FeatureRule, FeaturesConfig } from "@/lib/cs/features";
import { Plus, Trash2 } from "lucide-react";

const SINALEIRAS = ["verde", "amarelo", "vermelho"] as const;
const TAGS = ["recrutamento", "desenvolvimento"] as const;
const num = (v: string) => (v === "" ? undefined : Number(v));

/** Catálogo das funcionalidades e as condições de oferta (Bloco 12). */
export function FeaturesSettings({ value, onChange }: { value: FeaturesConfig; onChange: (v: FeaturesConfig) => void }) {
  const set = (i: number, patch: Partial<FeatureRule>) =>
    onChange({ ...value, funcionalidades: value.funcionalidades.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const cls = "h-8 text-xs";
  return (
    <div className="space-y-4">
      <p className="max-w-[80ch] text-[13px] text-muted-foreground">
        Cada funcionalidade tem um momento certo de oferta. Condições vazias = qualquer. "Pessoas mapeadas" vem do
        campo da empresa (Sobre esta empresa) até a planilha da sinaleira trazer esse dado.
      </p>
      <div className="grid max-w-md grid-cols-2 gap-3">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Reoferecer após (dias) se ficou sem resposta
          <Input className={cls} type="number" min={1} value={value.reoferta_dias} onChange={(e) => onChange({ ...value, reoferta_dias: Number(e.target.value) })} />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Reoferecer após (dias) se recusada
          <Input className={cls} type="number" min={1} value={value.recusa_dias} onChange={(e) => onChange({ ...value, recusa_dias: Number(e.target.value) })} />
        </label>
      </div>
      <div className="space-y-3">
        {value.funcionalidades.map((f, i) => (
          <div key={f.id} className="space-y-2 rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input className={cls} value={f.nome} onChange={(e) => set(i, { nome: e.target.value })} placeholder="Nome" />
              <Input className={cls} value={f.para_quem} onChange={(e) => set(i, { para_quem: e.target.value })} placeholder="Para quem" />
              <button type="button" onClick={() => onChange({ ...value, funcionalidades: value.funcionalidades.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground">tag_uso:</span>
              {TAGS.map((t) => (
                <label key={t} className="flex items-center gap-1"><input type="checkbox" checked={f.tag_uso.includes(t)} onChange={() => set(i, { tag_uso: toggle(f.tag_uso, t) })} />{t}</label>
              ))}
              <span className="ml-2 text-muted-foreground">sinaleira:</span>
              {SINALEIRAS.map((s) => (
                <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={f.sinaleiras.includes(s)} onChange={() => set(i, { sinaleiras: toggle(f.sinaleiras, s) })} />{s}</label>
              ))}
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.verde_consolidado} onChange={(e) => set(i, { verde_consolidado: e.target.checked })} />verde 8+ sem.</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!f.nao_vermelho_inicial} onChange={(e) => set(i, { nao_vermelho_inicial: e.target.checked })} />não no 1º vermelho</label>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Dias mín. de uso<Input className={cls} type="number" min={0} value={f.dias_min ?? ""} onChange={(e) => set(i, { dias_min: num(e.target.value) })} /></label>
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Pessoas mapeadas mín.<Input className={cls} type="number" min={0} value={f.pessoas_min ?? ""} onChange={(e) => set(i, { pessoas_min: num(e.target.value) })} /></label>
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Junto do módulo (MC)<Input className={cls} type="number" min={1} value={f.junto_modulo ?? ""} onChange={(e) => set(i, { junto_modulo: num(e.target.value) })} /></label>
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Gancho<Input className={cls} value={f.gancho} onChange={(e) => set(i, { gancho: e.target.value })} /></label>
            </div>
            <Input className={cls} value={f.resolve} onChange={(e) => set(i, { resolve: e.target.value })} placeholder="O que resolve" />
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => onChange({ ...value, funcionalidades: [...value.funcionalidades, { id: `func-${Date.now()}`, nome: "", para_quem: "", tag_uso: [], sinaleiras: [], resolve: "", gancho: "" }] })}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Funcionalidade
      </Button>
    </div>
  );
}
