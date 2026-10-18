import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";
import { listarRequerimentos } from "@/lib/requerimentos.functions";
import { STATUS_REQUERIMENTO } from "@/lib/requerimentos/regras";
import { dataBr } from "@/components/faturamento/faturamento-do-negocio";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/requerimentos")({
  component: RequerimentosPage,
  head: () => ({ meta: [{ title: "Requerimentos | Grou Compass" }] }),
});

const ROTULO = Object.fromEntries(STATUS_REQUERIMENTO.map((s) => [s.v, s.l]));

/**
 * Requerimentos de serviço: o comercial abre a partir do negócio, o ADM
 * prepara e escala a trainer, a trainer registra briefing e conclusão. Quem
 * quiser saber o que foi combinado abre aqui, em vez de procurar o e-mail.
 */
function RequerimentosPage() {
  const fn = useServerFn(listarRequerimentos);
  const [status, setStatus] = useState("");
  const [meus, setMeus] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["requerimentos", status, meus],
    queryFn: () => fn({ data: { status: status || undefined, meus } }),
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 lg:p-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardList className="h-5 w-5" /> Requerimentos de serviço
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Abertos pelo comercial no negócio ganho. O ADM prepara, escala a trainer e monta o
          cronograma; a trainer registra briefing e conclusão.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os andamentos</option>
          {STATUS_REQUERIMENTO.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </select>
        {data?.eTrainer && (
          <label className="flex items-center gap-1.5 text-[12px]">
            <input type="checkbox" checked={meus} onChange={(e) => setMeus(e.target.checked)} />
            Só onde estou escalada
          </label>
        )}
      </div>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Erro"}
        </p>
      ) : (data?.itens ?? []).length === 0 ? (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Nenhum requerimento. O comercial abre um pelo botão “Requerimento de serviço” no negócio
          ganho.
        </p>
      ) : (
        <ul className="space-y-2">
          {data?.itens.map((r) => (
            <li key={r.id}>
              <Link
                to="/requerimento/$id"
                params={{ id: r.id }}
                className="surface-panel flex flex-wrap items-center gap-3 p-3 transition-colors hover:border-primary/40"
              >
                <span className="w-12 text-[12px] text-muted-foreground">nº {r.numero}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{r.empresa ?? "—"}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {r.servico}
                    {r.formato ? ` · ${r.formato}` : ""}
                  </p>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  <p>{r.trainers.length ? r.trainers.join(", ") : "sem trainer"}</p>
                  {r.proximaSessao && <p>próxima sessão {dataBr(r.proximaSessao)}</p>}
                </div>
                <Badge
                  variant="outline"
                  className={
                    r.status === "solicitado"
                      ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                      : r.status === "concluido"
                        ? "border-emerald-500/40 text-emerald-600"
                        : ""
                  }
                >
                  {ROTULO[r.status] ?? r.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
