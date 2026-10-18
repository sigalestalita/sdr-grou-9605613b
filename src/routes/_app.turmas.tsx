import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Plus } from "lucide-react";
import { listarTurmas } from "@/lib/contratos-turmas.functions";
import { STATUS_TURMA, TurmaDialog } from "@/components/turmas/turma-dialog";
import { dataBr } from "@/components/faturamento/faturamento-do-negocio";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/turmas")({
  component: TurmasPage,
  head: () => ({ meta: [{ title: "Turmas | Grou Compass" }] }),
});

/**
 * Turmas (certificação aberta, capacitações). O comercial inscreve os
 * participantes pelo negócio; o ADM aprova e o aluno cai na turma; a trainer
 * faz o check-in. Antes, tudo isso era trabalho manual da Lauren.
 */
function TurmasPage() {
  const fn = useServerFn(listarTurmas);
  const { data, isLoading } = useQuery({ queryKey: ["turmas"], queryFn: () => fn() });
  const [nova, setNova] = useState(false);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <GraduationCap className="h-5 w-5" /> Turmas
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Inscrição pelo negócio, aprovação do ADM (dentro das vagas) e check-in da trainer.
          </p>
        </div>
        {data?.podeEditar && (
          <Button size="sm" onClick={() => setNova(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova turma
          </Button>
        )}
      </header>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (data?.turmas ?? []).length === 0 ? (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Nenhuma turma cadastrada.
        </p>
      ) : (
        <ul className="space-y-2">
          {data?.turmas.map((t) => (
            <li key={t.id}>
              <Link
                to="/turma/$id"
                params={{ id: t.id }}
                className="surface-panel flex flex-wrap items-center gap-3 p-3 hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{t.nome}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {dataBr(t.inicio)}
                    {t.fim && t.fim !== t.inicio ? ` a ${dataBr(t.fim)}` : ""}
                    {t.formato ? ` · ${t.formato}` : ""}
                    {t.trainer ? ` · ${t.trainer}` : ""}
                  </p>
                </div>
                <span className="text-[12px] text-muted-foreground">
                  {t.aprovadas}
                  {t.vagas ? `/${t.vagas}` : ""} aprovado(s)
                  {t.pendentes ? ` · ${t.pendentes} pendente(s)` : ""}
                </span>
                <Badge variant="outline">{STATUS_TURMA[t.status] ?? t.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {nova && <TurmaDialog onClose={() => setNova(false)} />}
    </div>
  );
}
