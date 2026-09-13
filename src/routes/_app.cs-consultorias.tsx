import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Handshake } from "lucide-react";
import { listCsConsultorias } from "@/lib/cs.functions";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/cs-consultorias")({
  component: ConsultoriasPage,
  head: () => ({
    meta: [
      { title: "Consultorias | Grou Compass" },
      {
        name: "description",
        content: "Consultorias por vencimento: o que venceu e o que vence na janela escolhida.",
      },
    ],
  }),
});

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Linha = {
  clientUid: string;
  nome: string;
  dataRenovacao: string | null;
  diasParaVencer: number | null;
  aporte: number;
  responsavel: string | null;
  comercial: string | null;
  ultimoContato: string | null;
};

/**
 * Consultorias. Elas não entram na carteira de atendimento nem na sinaleira:
 * o acompanhamento é pelo vencimento. A janela padrão pega 15 dias para trás,
 * para não deixar passar o que já venceu, e 15 para frente, para agir antes.
 */
function ConsultoriasPage() {
  const fn = useServerFn(listCsConsultorias);
  const [janela, setJanela] = useState("15");

  const q = useQuery({
    queryKey: ["cs-consultorias", janela],
    queryFn: () => fn({ data: { diasAntes: Number(janela), diasDepois: Number(janela) } }),
    staleTime: 60_000,
  });
  const d = q.data;

  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Handshake className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            Consultorias
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Aqui o que se acompanha é a renovação. Consultoria não entra na carteira de atendimento
            nem na sinaleira.
          </p>
        </div>
        <Select value={janela} onValueChange={setJanela}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <CalendarClock className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 dias para cada lado</SelectItem>
            <SelectItem value="30">30 dias para cada lado</SelectItem>
            <SelectItem value="60">60 dias para cada lado</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {q.isLoading && <p className="text-[13px] text-muted-foreground">Carregando…</p>}
      {q.error && (
        <p className="text-[13px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Erro ao carregar"}
        </p>
      )}

      {d && (
        <>
          <p className="text-[12px] text-muted-foreground">
            Janela de {format(new Date(`${d.janela.de}T12:00:00`), "dd/MM", { locale: ptBR })} a{" "}
            {format(new Date(`${d.janela.ate}T12:00:00`), "dd/MM", { locale: ptBR })} ·{" "}
            {d.totalConsultorias} consultorias ativas
            {d.semDataRenovacao > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                · {d.semDataRenovacao} sem data de renovação
              </span>
            )}
          </p>

          <Secao
            titulo="Venceram"
            sub="Passaram da data e continuam ativas."
            linhas={d.vencidas}
            tom="vencida"
          />
          <Secao
            titulo="A vencer"
            sub="Dá tempo de agir antes do prazo."
            linhas={d.aVencer}
            tom="aVencer"
          />
        </>
      )}
    </div>
  );
}

function Secao({
  titulo,
  sub,
  linhas,
  tom,
}: {
  titulo: string;
  sub: string;
  linhas: Linha[];
  tom: "vencida" | "aVencer";
}) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">{titulo}</h2>
        <span className="text-[11px] text-muted-foreground">{linhas.length}</span>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">{sub}</p>
      {linhas.length === 0 ? (
        <p className="py-2 text-[12px] text-muted-foreground">Nada nesta janela.</p>
      ) : (
        <ul className="divide-y">
          {linhas.map((l) => (
            <li key={l.clientUid} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  to="/empresas/$uid"
                  params={{ uid: l.clientUid }}
                  className="text-[13px] font-medium hover:underline"
                >
                  {l.nome}
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[
                    l.responsavel ? `CS ${l.responsavel}` : null,
                    l.comercial ? `Comercial ${l.comercial}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sem responsável"}
                </p>
              </div>
              {l.aporte > 0 && (
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {moeda(l.aporte)}
                </span>
              )}
              <span className="text-[12px] tabular-nums">
                {l.dataRenovacao
                  ? format(new Date(`${l.dataRenovacao}T12:00:00`), "dd/MM/yyyy")
                  : "—"}
              </span>
              <Badge
                variant="outline"
                className={
                  tom === "vencida"
                    ? "border-red-500/40 bg-red-500/10 text-[10px] text-red-600 dark:text-red-400"
                    : (l.diasParaVencer ?? 99) <= 7
                      ? "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                      : "text-[10px]"
                }
              >
                {l.diasParaVencer === null
                  ? "sem data"
                  : l.diasParaVencer < 0
                    ? `venceu há ${Math.abs(l.diasParaVencer)} d`
                    : l.diasParaVencer === 0
                      ? "vence hoje"
                      : `faltam ${l.diasParaVencer} d`}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
