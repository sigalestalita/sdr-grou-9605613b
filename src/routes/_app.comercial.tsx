import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  KanbanSquare,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { getComercialDashboard } from "@/lib/comercial.functions";
import { minhaFilaComercial } from "@/lib/comercial-negocio.functions";
import { assumirOportunidade, listOportunidadesAbertas } from "@/lib/oportunidades.functions";
import {
  fracaoDoPeriodo,
  moeda,
  progressoDaMeta,
  ritmo,
  RITMO_LABEL,
  type Ritmo,
} from "@/lib/comercial/metas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/comercial")({
  component: ComercialPage,
  head: () => ({
    meta: [
      { title: "Comercial | Grou Compass" },
      {
        name: "description",
        content: "Funil, metas e esteira do time comercial, por pessoa e por período.",
      },
    ],
  }),
});

type Periodo = "mes" | "mes_passado" | "90d";

const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Este mês",
  mes_passado: "Mês passado",
  "90d": "Últimos 90 dias",
};

function faixa(p: Periodo): { from: Date; to: Date } {
  const hoje = new Date();
  if (p === "mes_passado") {
    const ref = subMonths(hoje, 1);
    return { from: startOfMonth(ref), to: new Date(endOfMonth(ref).getTime() + 1) };
  }
  if (p === "90d") {
    const inicio = new Date(hoje);
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - 89);
    return { from: inicio, to: new Date(hoje.getTime() + 86400000) };
  }
  return { from: startOfMonth(hoje), to: new Date(endOfMonth(hoje).getTime() + 1) };
}

const RITMO_TONE: Record<Ritmo["status"], string> = {
  batido: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  em_dia: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  atencao: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  atrasado: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

/**
 * Painel do módulo comercial. A gestora vê o time inteiro e pode focar numa
 * pessoa; o executivo entra direto no próprio funil. As metas aparecem com
 * valor e quantidade lado a lado, que foi o ponto central do briefing.
 */
function ComercialPage() {
  const fn = useServerFn(getComercialDashboard);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [executivo, setExecutivo] = useState<string>("todos");
  const [pipeline, setPipeline] = useState<string>("todos");
  const range = useMemo(() => faixa(periodo), [periodo]);

  const q = useQuery({
    queryKey: ["comercial", periodo, executivo, pipeline],
    queryFn: () =>
      fn({
        data: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          ...(executivo !== "todos" ? { executivoId: executivo } : {}),
          ...(pipeline !== "todos" ? { pipelineId: pipeline } : {}),
        },
      }),
    staleTime: 60_000,
  });
  const d = q.data;
  const fracao = fracaoDoPeriodo(range.from, range.to);
  const maiorEtapa = Math.max(1, ...(d?.funil ?? []).map((f) => f.quantidade));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Comercial</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {d?.foco
              ? `Funil de ${d.foco.nome}`
              : "Funil de todos os executivos, com metas e esteira entre áreas."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d?.isManager && (
            <Select value={executivo} onValueChange={setExecutivo}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <Users className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os executivos</SelectItem>
                {(d?.pessoas ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={pipeline} onValueChange={setPipeline}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Funil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os funis</SelectItem>
              {(d?.pipelines ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <CalendarClock className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIODO_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {q.isLoading && <p className="text-[13px] text-muted-foreground">Carregando…</p>}
      {q.error && (
        <p className="text-[13px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Erro ao carregar"}
        </p>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              label="Em aberto"
              valor={String(d.resumo.abertos)}
              hint={moeda(d.resumo.valorAberto)}
            />
            <Tile
              label="Vendas ganhas"
              valor={String(d.resumo.ganhos)}
              hint={moeda(d.resumo.valorGanho)}
              tone="good"
            />
            <Tile
              label="Ticket médio"
              valor={moeda(d.resumo.ticketMedio)}
              hint="das vendas do período"
            />
            <Tile
              label="Agendas"
              valor={String(d.resumo.agendas)}
              hint={`${d.resumo.perdidos} perdas no período`}
            />
          </div>

          <MinhaFila />
          <SinalizacoesDoCs />

          {d.resumo.semOrdemCompra > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <strong>{d.resumo.semOrdemCompra}</strong>{" "}
                {d.resumo.semOrdemCompra === 1 ? "venda ganha está" : "vendas ganhas estão"} sem
                ordem de compra registrada. Venda ganha vale pela ordem de compra, não pelo aceite
                da proposta. Enquanto a data não é preenchida, o número da gestão e o do financeiro
                não fecham.
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section
              icon={TrendingUp}
              title="Funil por etapa"
              to="/comercial-pipeline"
              toLabel="Abrir kanban"
            >
              {d.funil.length === 0 ? (
                <p className="py-3 text-[13px] text-muted-foreground">
                  Nenhum negócio aberto nesse recorte.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.funil.map((f) => (
                    <li key={f.stageId} className="flex items-center gap-2 text-[12px]">
                      <span className="w-52 shrink-0 truncate text-muted-foreground" title={f.nome}>
                        {f.nome}
                      </span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((f.quantidade / maiorEtapa) * 100)}%` }}
                        />
                      </span>
                      <span className="w-10 text-right tabular-nums font-medium">
                        {f.quantidade}
                      </span>
                      <span className="w-24 text-right tabular-nums text-muted-foreground">
                        {moeda(f.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={ArrowRight} title="Esteira entre áreas">
              <p className="mb-2 text-[11px] text-muted-foreground">
                Depois da ordem de compra o cliente passa pelo ADM e só então chega ao CS.
              </p>
              <ul className="space-y-1.5 text-[12px]">
                {[
                  ["comercial", "No comercial"],
                  ["faturamento", "Em faturamento (ADM)"],
                  ["cs", "Entregue ao CS"],
                  ["concluido", "Concluído"],
                ].map(([chave, rotulo]) => (
                  <li key={chave} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <span className="tabular-nums font-medium">{d.esteira[chave] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section
            icon={Target}
            title="Metas e ritmo do time"
            to="/comercial-metas"
            toLabel="Definir metas"
          >
            {d.pessoas.length === 0 ? (
              <p className="py-3 text-[13px] text-muted-foreground">
                Nenhum executivo com negócios ou meta nesse período.
              </p>
            ) : (
              <div className="space-y-4">
                {d.pessoas.map((p) => {
                  const linhas = p.meta ? progressoDaMeta(p.meta, p.realizado) : [];
                  return (
                    <div key={p.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold">{p.nome}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{p.abertos} em aberto</span>
                          <span>·</span>
                          <span>{p.agendas} agendas</span>
                          <span>·</span>
                          <span>{p.propostas} propostas</span>
                          {p.conversao !== null && (
                            <>
                              <span>·</span>
                              <span>{p.conversao}% de conversão</span>
                            </>
                          )}
                        </div>
                      </div>
                      {linhas.length === 0 ? (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                          Sem meta definida para o período.{" "}
                          <Link to="/comercial-metas" className="text-primary hover:underline">
                            Definir agora
                          </Link>
                          .
                        </p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {linhas.map((l) => {
                            const r = ritmo(l, fracao);
                            return (
                              <div key={l.chave} className="flex items-center gap-2 text-[11px]">
                                <span className="w-32 shrink-0 text-muted-foreground">
                                  {l.rotulo}
                                </span>
                                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                  <span
                                    className={`block h-full rounded-full ${
                                      l.atingiu ? "bg-emerald-500" : "bg-primary"
                                    }`}
                                    style={{ width: `${l.pct}%` }}
                                  />
                                </span>
                                <span className="w-28 text-right tabular-nums">
                                  {l.chave === "valor"
                                    ? `${moeda(l.realizado)} / ${moeda(l.meta)}`
                                    : `${l.realizado} / ${l.meta}`}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`w-24 justify-center text-[9px] ${RITMO_TONE[r.status]}`}
                                >
                                  {RITMO_LABEL[r.status]}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  valor,
  hint,
  tone,
}: {
  label: string;
  valor: string;
  hint?: string;
  tone?: "good";
}) {
  return (
    <div className={`surface-panel p-3 ${tone === "good" ? "border-emerald-500/40" : ""}`}>
      <p className="section-label">{label}</p>
      <p className="metric-value mt-1 text-2xl">{valor}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  to,
  toLabel,
  children,
}: {
  icon: typeof Target;
  title: string;
  to?: string;
  toLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {to && (
          <Link
            to={to}
            className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
          >
            {toLabel ?? "Ver tudo"} <KanbanSquare className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * A fila do executivo: o que ele combinou de fazer e ainda não fez. Negócio
 * aberto sem próximo passo aparece junto, porque é o que some do radar.
 */
function MinhaFila() {
  const fn = useServerFn(minhaFilaComercial);
  const { data } = useQuery({
    queryKey: ["comercial-fila"],
    queryFn: () => fn({ data: { dias: 7 } }),
    staleTime: 60_000,
  });
  if (!data) return null;
  const { fila, semProximoPasso } = data;
  if (fila.length === 0 && semProximoPasso.length === 0) return null;

  return (
    <Section
      icon={CalendarClock}
      title="Meus próximos passos"
      to="/comercial-pipeline"
      toLabel="Ver pipeline"
    >
      {fila.length === 0 ? (
        <p className="py-1 text-[12px] text-muted-foreground">
          Nada combinado para os próximos dias.
        </p>
      ) : (
        <ul className="divide-y">
          {fila.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <Link
                  to="/negocio/$id"
                  params={{ id: f.id }}
                  className="text-[13px] font-medium hover:underline"
                >
                  {f.empresa || f.nome}
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">
                  {f.proximoPasso || "Sem descrição"}
                </p>
              </div>
              <span
                className={`whitespace-nowrap text-[11px] ${f.atrasado ? "font-medium text-destructive" : "text-muted-foreground"}`}
              >
                {f.atrasado ? "atrasado · " : ""}
                {format(new Date(f.quando), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {semProximoPasso.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            {semProximoPasso.length} negócio(s) aberto(s) sem próximo passo combinado
          </p>
          <div className="flex flex-wrap gap-1.5">
            {semProximoPasso.slice(0, 8).map((f) => (
              <Link
                key={f.id}
                to="/negocio/$id"
                params={{ id: f.id }}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {f.empresa || f.nome}
              </Link>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/**
 * O que o CS sinalizou e ninguém assumiu. Assumir cria o negócio já no funil
 * certo: recompra vai para o funil curto, cross sell para o longo, que tem
 * agenda de identificação de necessidade antes de virar oportunidade.
 */
function SinalizacoesDoCs() {
  const listFn = useServerFn(listOportunidadesAbertas);
  const assumirFn = useServerFn(assumirOportunidade);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["oportunidades-abertas"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  const assumir = useMutation({
    mutationFn: (id: string) => assumirFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success("Negócio criado no funil da carteira");
      qc.invalidateQueries({ queryKey: ["oportunidades-abertas"] });
      qc.invalidateQueries({ queryKey: ["comercial"] });
      navigate({ to: "/negocio/$id", params: { id: r.dealId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const lista = data?.oportunidades ?? [];
  if (lista.length === 0) return null;

  return (
    <Section icon={Sparkles} title="Sinalizações do CS" to="/cs" toLabel="Ver carteira">
      <p className="mb-2 text-[11px] text-muted-foreground">
        O analista viu a oportunidade no cliente. Assumir abre o negócio no seu nome.
      </p>
      <ul className="divide-y">
        {lista.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{o.empresa}</p>
              <p className="text-[11px] text-muted-foreground">{o.motivo}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {format(new Date(o.sinalizadaEm), "dd/MM", { locale: ptBR })}
                {o.sinalizadaPor ? ` · ${o.sinalizadaPor}` : ""}
                {o.produtoSugerido ? ` · ${o.produtoSugerido}` : ""}
              </p>
            </div>
            <Badge variant="outline" className="text-[9px]">
              {o.tipo === "cross_sell"
                ? "Cross sell"
                : o.tipo === "recompra"
                  ? "Recompra"
                  : "Renovação"}
            </Badge>
            {o.valorEstimado ? (
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {moeda(o.valorEstimado)}
              </span>
            ) : null}
            <Button size="sm" disabled={assumir.isPending} onClick={() => assumir.mutate(o.id)}>
              Assumir
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
