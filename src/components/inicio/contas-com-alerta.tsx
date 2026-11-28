import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contasComAlerta } from "@/lib/resumo-conta.functions";
import { TIMES, type Time } from "@/lib/empresa/resumo-por-time";
import { COR_DO_TIME, NOME_DO_TIME } from "@/components/empresa/cores-dos-times";

/*
 * Início da gestão: contas com algo pedindo ação em algum time (mesmas regras
 * dos cartões do resumo da conta). Primeiro as que têm alerta em mais times.
 * Clicar abre a ficha da empresa, já com o resumo por time no topo.
 */
export function ContasComAlerta() {
  const fn = useServerFn(contasComAlerta);
  const { data } = useQuery({
    queryKey: ["contas-com-alerta"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  const [time, setTime] = useState<Time | "todos">("todos");
  const [mostrar, setMostrar] = useState(15);
  if (!data) return null;

  const contas = data.filter((c) => time === "todos" || c.alertas.some((a) => a.area === time));
  const porTime = Object.fromEntries(
    TIMES.map((t) => [t.id, data.filter((c) => c.alertas.some((a) => a.area === t.id)).length]),
  ) as Record<Time, number>;

  return (
    <section className="surface-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Contas com alerta
          <span className="font-normal text-muted-foreground">({data.length})</span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(["todos", ...TIMES.map((t) => t.id)] as Array<Time | "todos">).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTime(t);
                setMostrar(15);
              }}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                time === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : t === "todos"
                    ? "text-muted-foreground"
                    : COR_DO_TIME[t].chip
              }`}
            >
              {t === "todos" ? "Todos" : `${NOME_DO_TIME[t]} · ${porTime[t]}`}
            </button>
          ))}
        </div>
      </div>
      {contas.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nenhuma conta com alerta aqui.</p>
      ) : (
        <ul className="divide-y">
          {contas.slice(0, mostrar).map((c) => (
            <li key={c.companyId}>
              <Link
                to="/empresas/$uid"
                params={{ uid: c.companyId }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px] hover:bg-muted/40"
              >
                <span className="min-w-[180px] flex-1 truncate font-medium">{c.empresa}</span>
                <span className="flex flex-wrap gap-1">
                  {c.alertas
                    .filter((a) => time === "todos" || a.area === time)
                    .map((a) => (
                      <span
                        key={`${a.area}-${a.alerta}`}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${COR_DO_TIME[a.area as Time]?.chip ?? ""}`}
                      >
                        {a.alerta}
                        {a.qtd > 1 ? ` (${a.qtd})` : ""}
                      </span>
                    ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {contas.length > mostrar && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px]"
          onClick={() => setMostrar((m) => m + 30)}
        >
          Ver mais ({contas.length - mostrar})
        </Button>
      )}
    </section>
  );
}
