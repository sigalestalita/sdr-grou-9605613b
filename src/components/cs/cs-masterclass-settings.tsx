import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DIAG_CAUSES,
  DIAG_CAUSE_LABEL,
  type MasterclassConfig,
  type MasterclassRule,
} from "@/lib/cs/masterclass";
import { Plus, Trash2 } from "lucide-react";

const COR_LABEL = {
  verde: "Verde",
  amarelo: "Amarelo",
  vermelho: "Vermelho",
  qualquer: "Qualquer",
} as const;
const num = (v: string) => (v === "" ? undefined : Number(v));

/** Catálogo dos módulos, regra de oferta por cor/tempo e marcos de sucesso. */
export function MasterclassSettings({
  value,
  onChange,
}: {
  value: MasterclassConfig;
  onChange: (v: MasterclassConfig) => void;
}) {
  const setRule = (i: number, patch: Partial<MasterclassRule>) =>
    onChange({ ...value, regras: value.regras.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const mods = (s: string) =>
    s
      .split(/[,\s]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);
  const inputCls = "h-8 text-xs";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Módulos</h3>
        <p className="max-w-[80ch] text-[13px] text-muted-foreground">
          Gratuitas, 45 min, conduzidas pelos analistas. Marque a tag_uso quando o módulo é o
          indicado para aquele uso do PDA (a regra "módulo do tag_uso" usa isso).
        </p>
        <div className="space-y-1.5">
          {value.modulos.map((m, i) => (
            <div key={m.id} className="grid gap-1.5 sm:grid-cols-[3rem_1fr_2fr_10rem]">
              <Input className={inputCls} value={m.id} readOnly />
              <Input
                className={inputCls}
                value={m.nome}
                onChange={(e) =>
                  onChange({
                    ...value,
                    modulos: value.modulos.map((x, j) =>
                      j === i ? { ...x, nome: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                className={inputCls}
                value={m.descricao}
                onChange={(e) =>
                  onChange({
                    ...value,
                    modulos: value.modulos.map((x, j) =>
                      j === i ? { ...x, descricao: e.target.value } : x,
                    ),
                  })
                }
              />
              <select
                value={m.tag_uso ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    modulos: value.modulos.map((x, j) =>
                      j === i ? { ...x, tag_uso: (e.target.value || undefined) as never } : x,
                    ),
                  })
                }
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">sem tag_uso</option>
                <option value="recrutamento">recrutamento</option>
                <option value="desenvolvimento">desenvolvimento</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Quando oferecer (cor e tempo)</h3>
        <p className="max-w-[80ch] text-[13px] text-muted-foreground">
          Semanas = semanas seguidas na cor. Vermelho usa a causa do diagnóstico da empresa. Mês do
          contrato vale para qualquer cor. Módulos já realizados não são sugeridos de novo.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2">Cor</th>
                <th className="py-1 pr-2">Sem. mín</th>
                <th className="py-1 pr-2">Sem. máx</th>
                <th className="py-1 pr-2">Causa (vermelho)</th>
                <th className="py-1 pr-2">Mês contrato</th>
                <th className="py-1 pr-2">Módulos</th>
                <th className="py-1 pr-2">+ tag_uso</th>
                <th className="py-1 pr-2">Motivo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {value.regras.map((r, i) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1 pr-2">
                    <select
                      value={r.cor}
                      onChange={(e) =>
                        setRule(i, { cor: e.target.value as MasterclassRule["cor"] })
                      }
                      className="h-8 rounded-md border bg-background px-1 text-xs"
                    >
                      {Object.entries(COR_LABEL).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      className={`${inputCls} w-16`}
                      type="number"
                      min={0}
                      value={r.semanas_min ?? ""}
                      onChange={(e) => setRule(i, { semanas_min: num(e.target.value) })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      className={`${inputCls} w-16`}
                      type="number"
                      min={0}
                      value={r.semanas_max ?? ""}
                      onChange={(e) => setRule(i, { semanas_max: num(e.target.value) })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={r.causa ?? ""}
                      onChange={(e) =>
                        setRule(i, { causa: (e.target.value || undefined) as never })
                      }
                      className="h-8 rounded-md border bg-background px-1 text-xs"
                    >
                      <option value="">—</option>
                      {DIAG_CAUSES.map((c) => (
                        <option key={c} value={c}>
                          {DIAG_CAUSE_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      className={`${inputCls} w-16`}
                      type="number"
                      min={1}
                      value={r.mes_contrato ?? ""}
                      onChange={(e) => setRule(i, { mes_contrato: num(e.target.value) })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      className={`${inputCls} w-20`}
                      value={r.modulos.join(", ")}
                      onChange={(e) => setRule(i, { modulos: mods(e.target.value) })}
                      placeholder="4, 5"
                    />
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.usar_tag_uso}
                      onChange={(e) => setRule(i, { usar_tag_uso: e.target.checked })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      className={`${inputCls} min-w-56`}
                      value={r.motivo}
                      onChange={(e) => setRule(i, { motivo: e.target.value })}
                    />
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() =>
                        onChange({ ...value, regras: value.regras.filter((_, j) => j !== i) })
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover regra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              regras: [
                ...value.regras,
                { id: `regra-${Date.now()}`, cor: "qualquer", modulos: [], motivo: "" },
              ],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Regra
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Marcos de sucesso</h3>
        <p className="max-w-[80ch] text-[13px] text-muted-foreground">
          Atingido o marco, o sistema registra nas observações e na timeline da empresa.
        </p>
        {(["primeiro", "segundo"] as const).map((k) => (
          <div
            key={k}
            className="grid max-w-2xl gap-2 sm:grid-cols-[8rem_1fr_1fr_1fr] sm:items-center"
          >
            <span className="text-sm">{k === "primeiro" ? "1º Sucesso" : "2º Sucesso"}</span>
            <label className="space-y-0.5 text-[11px] text-muted-foreground">
              Módulos
              <Input
                className={inputCls}
                value={value.sucesso[k].modulos.join(", ")}
                onChange={(e) =>
                  onChange({
                    ...value,
                    sucesso: {
                      ...value.sucesso,
                      [k]: { ...value.sucesso[k], modulos: mods(e.target.value) },
                    },
                  })
                }
              />
            </label>
            <label className="space-y-0.5 text-[11px] text-muted-foreground">
              Participações (distintas)
              <Input
                className={inputCls}
                type="number"
                min={1}
                value={value.sucesso[k].participacoes}
                onChange={(e) =>
                  onChange({
                    ...value,
                    sucesso: {
                      ...value.sucesso,
                      [k]: { ...value.sucesso[k], participacoes: Number(e.target.value) },
                    },
                  })
                }
              />
            </label>
            <label className="space-y-0.5 text-[11px] text-muted-foreground">
              Usos em projeto real
              <Input
                className={inputCls}
                type="number"
                min={0}
                value={value.sucesso[k].usos}
                onChange={(e) =>
                  onChange({
                    ...value,
                    sucesso: {
                      ...value.sucesso,
                      [k]: { ...value.sucesso[k], usos: Number(e.target.value) },
                    },
                  })
                }
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
