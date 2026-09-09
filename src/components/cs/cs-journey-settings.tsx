import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JourneyConfig } from "@/lib/cs/journey";

/** Jornadas Reais: modo de envio, assinatura e os 4 e-mails (texto fixo, editável pela gestão). */
export function JourneySettings({ value, onChange }: { value: JourneyConfig; onChange: (v: JourneyConfig) => void }) {
  const setEmail = (i: number, patch: Partial<JourneyConfig["emails"][number]>) =>
    onChange({ ...value, emails: value.emails.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return (
    <div className="space-y-5">
      <p className="max-w-[80ch] text-[13px] text-muted-foreground">
        Disparados por marco da licença (dia 30, 90, 180, 300), não pela sinaleira. O texto é calibrado —
        só [nome] e a assinatura mudam. Cada envio entra na timeline da empresa como e-mail enviado.
      </p>
      <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Modo de envio
          <select value={value.modo} onChange={(e) => onChange({ ...value, modo: e.target.value as JourneyConfig["modo"] })} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
            <option value="aprovacao">Aprovação (analista envia)</option>
            <option value="automatico">Automático no dia</option>
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Assinatura
          <Input className="h-8 text-xs" value={value.assinatura} onChange={(e) => onChange({ ...value, assinatura: e.target.value })} />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Janela após o marco (dias)
          <Input className="h-8 text-xs" type="number" min={0} value={value.janela_dias} onChange={(e) => onChange({ ...value, janela_dias: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 pt-4 text-xs">
          <input type="checkbox" checked={value.responder_para_responsavel} onChange={(e) => onChange({ ...value, responder_para_responsavel: e.target.checked })} />
          Responder-para = caixa do CS responsável
        </label>
      </div>
      <div className="space-y-3">
        {value.emails.map((e, i) => (
          <div key={e.id} className="space-y-2 rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr_auto]">
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Dia<Input className="h-8 text-xs" type="number" min={1} value={e.dia} onChange={(ev) => setEmail(i, { dia: Number(ev.target.value) })} /></label>
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Título interno<Input className="h-8 text-xs" value={e.titulo} onChange={(ev) => setEmail(i, { titulo: ev.target.value })} /></label>
              <label className="space-y-0.5 text-[11px] text-muted-foreground">Assunto<Input className="h-8 text-xs" value={e.assunto} onChange={(ev) => setEmail(i, { assunto: ev.target.value })} /></label>
              <label className="flex items-center gap-1 pt-4 text-xs"><input type="checkbox" checked={e.ativo} onChange={(ev) => setEmail(i, { ativo: ev.target.checked })} />Ativo</label>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground">Para quem (tag_uso):</span>
              {(["recrutamento", "desenvolvimento"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <input type="checkbox" checked={e.tag_uso.includes(t)} onChange={() => setEmail(i, { tag_uso: e.tag_uso.includes(t) ? e.tag_uso.filter((x) => x !== t) : [...e.tag_uso, t] })} />
                  {t}
                </label>
              ))}
              <span className="text-muted-foreground">(nenhum marcado = todos)</span>
            </div>
            <Textarea rows={8} className="text-xs" value={e.corpo} onChange={(ev) => setEmail(i, { corpo: ev.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}
