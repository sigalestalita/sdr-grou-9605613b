import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { checkinInscricao, decidirInscricao, getTurma } from "@/lib/contratos-turmas.functions";
import { downloadCsv } from "@/lib/export-csv";
import { dataBr } from "@/components/faturamento/faturamento-do-negocio";
import { STATUS_TURMA, TurmaDialog } from "@/components/turmas/turma-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/turma/$id")({
  component: TurmaPage,
  head: () => ({ meta: [{ title: "Turma | Grou Compass" }] }),
});

const STATUS_INSC: Record<string, string> = {
  pendente: "aguardando ADM",
  aprovada: "aprovada",
  recusada: "recusada",
  cancelada: "cancelada",
};

/** Turma: aprovação das inscrições (ADM), lista e check-in (trainer). */
function TurmaPage() {
  const { id } = useParams({ from: "/_app/turma/$id" });
  const qc = useQueryClient();
  const fn = useServerFn(getTurma);
  const decidirFn = useServerFn(decidirInscricao);
  const checkinFn = useServerFn(checkinInscricao);
  const { data, isLoading, error } = useQuery({
    queryKey: ["turma", id],
    queryFn: () => fn({ data: { id } }),
  });
  const [editando, setEditando] = useState(false);
  const recarrega = () => {
    qc.invalidateQueries({ queryKey: ["turma", id] });
    qc.invalidateQueries({ queryKey: ["turmas"] });
  };
  const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro");
  const decidir = useMutation({
    mutationFn: (v: { id: string; status: "aprovada" | "recusada" | "cancelada" | "pendente" }) =>
      decidirFn({ data: v }),
    onSuccess: recarrega,
    onError: erro,
  });
  const checkin = useMutation({
    mutationFn: (v: { id: string; presente: boolean }) => checkinFn({ data: v }),
    onSuccess: recarrega,
    onError: erro,
  });

  if (isLoading) return <p className="p-8 text-[13px] text-muted-foreground">Carregando…</p>;
  if (error || !data)
    return (
      <p className="p-8 text-[13px] text-destructive">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );
  const t = data.turma;
  const aprovadas = data.inscricoes.filter((i) => i.status === "aprovada");
  const presentes = aprovadas.filter((i) => i.checkin_em).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 p-4 lg:p-8">
      <Link
        to="/turmas"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Turmas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{String(t.nome)}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {dataBr(t.inicio as string | null)}
            {t.fim && t.fim !== t.inicio ? ` a ${dataBr(t.fim as string)}` : ""}
            {t.horario ? ` · ${t.horario}` : ""}
            {t.formato ? ` · ${t.formato}` : ""}
            {t.local ? ` · ${t.local}` : ""}
            {t.kickoff_em
              ? ` · kick-off ${new Date(String(t.kickoff_em)).toLocaleString("pt-BR")}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{STATUS_TURMA[String(t.status)] ?? t.status}</Badge>
          {data.podeEditar && (
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              Editar
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
        <span>
          {aprovadas.length}
          {t.vagas ? ` de ${t.vagas}` : ""} vaga(s) ocupada(s)
        </span>
        <span>{presentes} presente(s) no check-in</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={aprovadas.length === 0}
          onClick={() =>
            downloadCsv(
              `turma-${String(t.nome).replace(/\W+/g, "-").toLowerCase()}.csv`,
              aprovadas.map((i) => ({
                Nome: i.participante_nome,
                "E-mail": i.participante_email ?? "",
                Telefone: i.participante_telefone ?? "",
                Empresa: i.empresa ?? "",
                Presente: i.checkin_em ? "sim" : "não",
              })),
            )
          }
        >
          <Download className="mr-1 h-3.5 w-3.5" /> Lista
        </Button>
      </div>

      <section className="surface-panel overflow-x-auto p-3">
        {data.inscricoes.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">
            Sem inscrições. O comercial inscreve pelo negócio (“Inscrever em turma”).
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Participante</th>
                <th className="py-1 pr-2">Empresa</th>
                <th className="py-1 pr-2">Situação</th>
                <th className="py-1 pr-2">Check-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.inscricoes.map((i) => (
                <tr key={String(i.id)} className="border-t">
                  <td className="py-1 pr-2">
                    <p className="font-medium">{i.participante_nome}</p>
                    <p className="text-muted-foreground">
                      {[i.participante_email, i.participante_telefone].filter(Boolean).join(" · ")}
                    </p>
                  </td>
                  <td className="py-1 pr-2">
                    {i.deal_id ? (
                      <Link
                        to="/negocio/$id"
                        params={{ id: String(i.deal_id) }}
                        className="hover:underline"
                      >
                        {i.empresa ?? "negócio"}
                      </Link>
                    ) : (
                      (i.empresa ?? "—")
                    )}
                  </td>
                  <td className="py-1 pr-2">{STATUS_INSC[String(i.status)] ?? i.status}</td>
                  <td className="py-1 pr-2">
                    {i.status === "aprovada" && (data.podeEditar || data.souTrainer) ? (
                      <input
                        type="checkbox"
                        checked={!!i.checkin_em}
                        onChange={(e) =>
                          checkin.mutate({ id: String(i.id), presente: e.target.checked })
                        }
                      />
                    ) : i.checkin_em ? (
                      "presente"
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 text-right">
                    {data.podeEditar && i.status === "pendente" && (
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => decidir.mutate({ id: String(i.id), status: "aprovada" })}
                        >
                          aprovar
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => decidir.mutate({ id: String(i.id), status: "recusada" })}
                        >
                          recusar
                        </button>
                      </span>
                    )}
                    {data.podeEditar && i.status === "aprovada" && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => decidir.mutate({ id: String(i.id), status: "cancelada" })}
                      >
                        cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editando && <TurmaDialog turma={t} onClose={() => setEditando(false)} />}
    </div>
  );
}
