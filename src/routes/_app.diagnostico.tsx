import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { runPipelineDiagnostics } from "@/lib/diagnostico.functions";

export const Route = createFileRoute("/_app/diagnostico")({
  component: DiagnosticoPage,
  head: () => ({ meta: [{ title: "Diagnóstico do Pipeline | Grou Compass" }] }),
});

/** Só gestão. Não aparece no menu: /diagnostico */
function DiagnosticoPage() {
  const fn = useServerFn(runPipelineDiagnostics);
  const q = useQuery({ queryKey: ["diagnostico-pipeline"], queryFn: () => fn(), retry: false });
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Diagnóstico do Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Cada consulta que a tela do Pipeline faz, com contagem e tempo. Tire um print desta tela
            e envie.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? "Medindo…" : "Medir de novo"}
        </Button>
      </div>
      {q.error && (
        <Card className="p-4 text-sm text-destructive">{(q.error as Error).message}</Card>
      )}
      {q.data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Etapa</th>
                <th className="px-4 py-2 text-right">Tempo</th>
                <th className="px-4 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {q.data.steps.map((s) => (
                <tr key={s.etapa} className="border-b border-border/60">
                  <td className="px-4 py-2">{s.etapa}</td>
                  <td
                    className={`px-4 py-2 text-right font-mono ${s.ms > 2000 ? "font-semibold text-destructive" : s.ms > 700 ? "text-amber-600" : ""}`}
                  >
                    {s.ms} ms
                  </td>
                  <td className="px-4 py-2">{s.resultado}</td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-2 font-semibold">Total (em série)</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">
                  {q.data.totalMs} ms
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  medido em {new Date(q.data.at).toLocaleString("pt-BR")}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
