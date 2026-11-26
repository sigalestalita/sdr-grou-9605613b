import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { eventosDeUso, podeVerUso, resumoDeUso } from "@/lib/uso.functions";
import { formatarMinutos } from "@/lib/uso";
import { downloadCsv } from "@/lib/export-csv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/uso")({
  head: () => ({ meta: [{ title: "Logs de uso — Grou Compass" }] }),
  component: UsoPage,
});

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
] as const;
type Periodo = (typeof PERIODOS)[number]["id"];

function intervalo(p: Periodo) {
  const ate = new Date();
  ate.setMinutes(ate.getMinutes() + 1, 0, 0);
  const de = new Date();
  if (p === "hoje") de.setHours(0, 0, 0, 0);
  else {
    de.setDate(de.getDate() - Number(p));
    de.setSeconds(0, 0);
  }
  return { de: de.toISOString(), ate: ate.toISOString() };
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function haQuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

type EventoDeUso = {
  tipo: "entrada" | "pagina" | "acao" | "aberto";
  detalhe: string | null;
};

/** O que aconteceu, em palavras: no reconstruído, o detalhe gravado na carga. */
function rotuloDoEvento(e: EventoDeUso): string {
  if (e.tipo === "entrada") return "Entrou no Compass";
  if (e.tipo === "aberto") return "Compass aberto";
  return e.detalhe ?? (e.tipo === "pagina" ? "Abriu tela" : "Ação");
}

function SeloReconstruido() {
  return (
    <Badge
      variant="outline"
      className="border-amber-500/40 text-[10px] font-normal text-amber-500"
      title="Reconstruído a partir do que o banco já guardava, antes do registro de uso existir"
    >
      reconstruído
    </Badge>
  );
}

function UsoPage() {
  const podeFn = useServerFn(podeVerUso);
  const resumoFn = useServerFn(resumoDeUso);
  const eventosFn = useServerFn(eventosDeUso);
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [pessoa, setPessoa] = useState<string>("todas");
  // o intervalo fica fixo enquanto o período não muda (a chave da consulta não anda sozinha)
  const janela = useMemo(() => intervalo(periodo), [periodo]);

  const pode = useQuery({ queryKey: ["uso-pode"], queryFn: () => podeFn() });
  const resumo = useQuery({
    queryKey: ["uso-resumo", janela],
    queryFn: () => resumoFn({ data: janela }),
    enabled: pode.data === true,
  });
  const eventos = useInfiniteQuery({
    queryKey: ["uso-eventos", janela, pessoa],
    queryFn: ({ pageParam }) =>
      eventosFn({
        data: {
          ...janela,
          userId: pessoa === "todas" ? undefined : pessoa,
          antesDe: pageParam ?? undefined,
        },
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (ultima) => ultima.proximo,
    enabled: pode.data === true,
  });

  if (pode.isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!pode.data)
    return (
      <div className="max-w-2xl p-8">
        <Card className="space-y-2 p-6">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Os logs de uso dos usuários do Compass são restritos.
          </p>
        </Card>
      </div>
    );

  const pessoas = resumo.data?.pessoas ?? [];
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.nome]));
  const visiveis = pessoa === "todas" ? pessoas : pessoas.filter((p) => p.id === pessoa);
  const ativas = visiveis.filter((p) => p.sessoes > 0);
  const semUso7 = visiveis.filter(
    (p) =>
      !p.removido &&
      (!p.ultimoAcesso || Date.now() - new Date(p.ultimoAcesso).getTime() > 7 * 86400000),
  );
  const linhas = eventos.data?.pages.flatMap((pg) => pg.eventos) ?? [];
  const temReconstruido =
    visiveis.some((p) => p.reconstruidos > 0) || linhas.some((e) => e.reconstruido);
  const periodoLabel = PERIODOS.find((p) => p.id === periodo)?.label ?? "";

  const exportarResumo = () =>
    downloadCsv(
      `uso-por-pessoa-${periodo}.csv`,
      visiveis.map((p) => ({
        Pessoa: p.nome,
        "E-mail": p.email,
        "Último acesso": p.ultimoAcesso ? dataHora(p.ultimoAcesso) : "",
        "Dias ativos": p.diasAtivos,
        Sessões: p.sessoes,
        "Telas abertas": p.paginas,
        "Tempo ativo (min)": p.minutosAtivos,
        "Eventos reconstruídos": p.reconstruidos,
        "Telas mais usadas": p.telas
          .slice(0, 5)
          .map((t) => `${t.nome} (${t.n})`)
          .join(", "),
      })),
    );
  const exportarAtividade = () =>
    downloadCsv(
      `uso-atividade-${periodo}.csv`,
      linhas.map((e) => ({
        Quando: dataHora(e.created_at),
        Pessoa: nomeDe.get(e.user_id) ?? e.user_id,
        Evento: rotuloDoEvento(e),
        Reconstruído: e.reconstruido ? "sim" : "não",
        Tela: e.tela,
        Rota: e.rota ?? "",
        Sessão: e.sessao,
      })),
    );

  return (
    <div className="max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ScrollText className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            Logs de uso
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Quem entrou no Compass, quais telas abriu e quanto tempo ficou ativo. O tempo ativo
            conta blocos de 5 minutos com a aba aberta e a pessoa usando: uma tela esquecida aberta
            não soma.
          </p>
          {temReconstruido && (
            <p className="mt-2 max-w-2xl rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
              <SeloReconstruido /> O registro de uso começou em 25/11 às 21:15. De 23/11 até ali, o
              uso foi reconstruído do que o banco já guardava: as renovações de login (“Compass
              aberto”, inclusive com a aba parada, que não contam como tempo ativo), os cards de
              lead abertos e as ações feitas — mudança de etapa, toque, WhatsApp digitado, tarefa e
              registro do CS, nota. Telas consultadas sem nenhuma ação não aparecem nesse trecho.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  periodo === p.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Select value={pessoa} onValueChange={setPessoa}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as pessoas</SelectItem>
              {[...pessoas]
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold tabular-nums">
            {ativas.length}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {visiveis.filter((p) => !p.removido).length}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Pessoas que usaram · {periodoLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold tabular-nums">
            {formatarMinutos(visiveis.reduce((a, p) => a + p.minutosAtivos, 0))}
          </p>
          <p className="text-xs text-muted-foreground">Tempo ativo somado</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold tabular-nums">
            {visiveis.reduce((a, p) => a + p.paginas, 0).toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-muted-foreground">Telas abertas</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold tabular-nums text-amber-500">{semUso7.length}</p>
          <p className="text-xs text-muted-foreground">Sem entrar há mais de 7 dias</p>
        </Card>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Por pessoa</h2>
          <Button size="sm" variant="outline" onClick={exportarResumo} disabled={!visiveis.length}>
            <Download className="mr-1 h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Pessoa</th>
                  <th className="p-3 text-left">Último acesso</th>
                  <th className="p-3 text-right">Dias ativos</th>
                  <th className="p-3 text-right">Sessões</th>
                  <th className="p-3 text-right">Telas abertas</th>
                  <th className="p-3 text-right">Tempo ativo</th>
                  <th className="p-3 text-left">Telas mais usadas</th>
                </tr>
              </thead>
              <tbody>
                {resumo.isLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {resumo.error && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-destructive">
                      {(resumo.error as Error).message}
                    </td>
                  </tr>
                )}
                {visiveis.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-t border-white/5 align-top hover:bg-white/[0.02]"
                    onClick={() => setPessoa(p.id)}
                    title="Ver a atividade dessa pessoa"
                  >
                    <td className="p-3">
                      <p className="font-medium">
                        {p.nome}{" "}
                        {p.removido && (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            removido
                          </Badge>
                        )}
                        {p.reconstruidos > 0 && <SeloReconstruido />}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                    </td>
                    <td className="p-3 text-xs">
                      <span className={p.ultimoAcesso ? "" : "text-amber-500"}>
                        {haQuanto(p.ultimoAcesso)}
                      </span>
                      {p.ultimoAcesso && (
                        <p className="text-muted-foreground">{dataHora(p.ultimoAcesso)}</p>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{p.diasAtivos || "—"}</td>
                    <td className="p-3 text-right tabular-nums">{p.sessoes || "—"}</td>
                    <td className="p-3 text-right tabular-nums">{p.paginas || "—"}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap">
                      {formatarMinutos(p.minutosAtivos)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {p.telas
                        .slice(0, 3)
                        .map((t) => `${t.nome} (${t.n})`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Atividade
            {pessoa !== "todas" && (
              <span className="font-normal text-muted-foreground"> · {nomeDe.get(pessoa)}</span>
            )}
          </h2>
          <div className="flex gap-2">
            {pessoa !== "todas" && (
              <Button size="sm" variant="ghost" onClick={() => setPessoa("todas")}>
                Ver todas as pessoas
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={exportarAtividade}
              disabled={!linhas.length}
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Exportar
            </Button>
          </div>
        </div>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Quando</th>
                  <th className="p-3 text-left">Pessoa</th>
                  <th className="p-3 text-left">Evento</th>
                  <th className="p-3 text-left">Tela</th>
                </tr>
              </thead>
              <tbody>
                {eventos.isLoading && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!eventos.isLoading && linhas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Nenhuma atividade no período.
                    </td>
                  </tr>
                )}
                {linhas.map((e) => (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="p-3 text-xs whitespace-nowrap tabular-nums">
                      {dataHora(e.created_at)}
                    </td>
                    <td className="p-3">{nomeDe.get(e.user_id) ?? "—"}</td>
                    <td className="p-3 text-xs">
                      {e.tipo === "entrada" ? (
                        <Badge variant="outline">Entrou no Compass</Badge>
                      ) : (
                        <span className={e.tipo === "aberto" ? "text-muted-foreground" : ""}>
                          {rotuloDoEvento(e)}
                        </span>
                      )}
                      {e.reconstruido && (
                        <span className="ml-1.5">
                          <SeloReconstruido />
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span>{e.tipo === "aberto" ? "—" : e.tela}</span>
                      {e.rota && e.tela !== e.rota && (
                        <span className="ml-2 text-xs text-muted-foreground">{e.rota}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {eventos.hasNextPage && (
            <div className="border-t border-white/5 p-3 text-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => eventos.fetchNextPage()}
                disabled={eventos.isFetchingNextPage}
              >
                {eventos.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
              </Button>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
