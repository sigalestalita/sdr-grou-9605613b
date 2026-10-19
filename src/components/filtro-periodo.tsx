import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Período em datas locais "aaaa-mm-dd"; vazio = sem limite. */
export type Periodo = { de: string; ate: string };

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ATALHOS: Array<{ v: string; l: string; calc: () => Periodo }> = [
  { v: "hoje", l: "Hoje", calc: () => ({ de: fmt(new Date()), ate: fmt(new Date()) }) },
  {
    v: "ontem",
    l: "Ontem",
    calc: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { de: fmt(d), ate: fmt(d) };
    },
  },
  ...[7, 15, 30, 90, 180].map((n) => ({
    v: `${n}d`,
    l: `Últimos ${n} dias`,
    calc: () => {
      const d = new Date();
      d.setDate(d.getDate() - (n - 1));
      return { de: fmt(d), ate: fmt(new Date()) };
    },
  })),
  {
    v: "mes",
    l: "Este mês",
    calc: () => {
      const h = new Date();
      return { de: fmt(new Date(h.getFullYear(), h.getMonth(), 1)), ate: fmt(h) };
    },
  },
  {
    v: "mes_ant",
    l: "Mês anterior",
    calc: () => {
      const h = new Date();
      return {
        de: fmt(new Date(h.getFullYear(), h.getMonth() - 1, 1)),
        ate: fmt(new Date(h.getFullYear(), h.getMonth(), 0)),
      };
    },
  },
];

export function periodoDoAtalho(v: string): Periodo {
  return ATALHOS.find((a) => a.v === v)?.calc() ?? { de: "", ate: "" };
}

/** Início e fim do período em ISO (dia inteiro, no fuso de quem está usando). */
export function periodoEmIso(p: Periodo): { from?: string; to?: string } {
  return {
    from: p.de ? new Date(`${p.de}T00:00:00`).toISOString() : undefined,
    to: p.ate ? new Date(`${p.ate}T23:59:59.999`).toISOString() : undefined,
  };
}

/**
 * Período com atalhos e "Personalizado" (de/até). O atalho que bate com as
 * datas aparece selecionado; qualquer outro intervalo é "Personalizado".
 */
export function FiltroPeriodo({
  value,
  onChange,
  permitirTodos = false,
}: {
  value: Periodo;
  onChange: (p: Periodo) => void;
  /** Mostra a opção "Todo o período" (sem limite de datas). */
  permitirTodos?: boolean;
}) {
  // "Personalizado" é escolha de quem usa: as datas podem até coincidir com um
  // atalho e os campos de data continuam abertos.
  const [modoPersonalizado, setModoPersonalizado] = useState(false);
  const atalho =
    !value.de && !value.ate
      ? "todos"
      : (ATALHOS.find((a) => {
          const p = a.calc();
          return p.de === value.de && p.ate === value.ate;
        })?.v ?? "personalizado");
  const personalizado = modoPersonalizado || atalho === "personalizado";
  const atual = personalizado ? "personalizado" : atalho;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={atual}
        onChange={(e) => {
          const v = e.target.value;
          setModoPersonalizado(v === "personalizado");
          if (v === "todos") onChange({ de: "", ate: "" });
          else if (v === "personalizado")
            onChange({ de: value.de || fmt(new Date()), ate: value.ate || fmt(new Date()) });
          else onChange(periodoDoAtalho(v));
        }}
        className="h-8 rounded-md border bg-background px-2 text-xs"
        title="Período"
      >
        {permitirTodos && <option value="todos">Todo o período</option>}
        {ATALHOS.map((a) => (
          <option key={a.v} value={a.v}>
            {a.l}
          </option>
        ))}
        <option value="personalizado">Personalizado…</option>
      </select>
      {personalizado && (
        <>
          <Input
            type="date"
            value={value.de}
            max={value.ate || undefined}
            onChange={(e) => onChange({ ...value, de: e.target.value })}
            className="h-8 w-[138px] text-xs"
            title="De"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={value.ate}
            min={value.de || undefined}
            onChange={(e) => onChange({ ...value, ate: e.target.value })}
            className="h-8 w-[138px] text-xs"
            title="Até"
          />
        </>
      )}
    </div>
  );
}
