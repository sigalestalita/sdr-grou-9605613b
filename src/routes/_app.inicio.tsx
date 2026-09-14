import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Briefcase,
  CalendarClock,
  Handshake,
  KanbanSquare,
  LifeBuoy,
  Send,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { useCurrentRole } from "@/lib/use-role";
import { getWelcome, type GestaoComercialMetrics } from "@/lib/welcome.functions";
import { accessLabel, TEAM_COLORS } from "@/lib/teams";
import { moeda } from "@/lib/comercial/metas";
import { CsHomeSections, Empty, Section } from "@/components/cs/cs-home";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/inicio")({
  component: WelcomePage,
  head: () => ({
    meta: [
      { title: "Início | Grou Compass" },
      {
        name: "description",
        content: "Boas-vindas: as métricas mais importantes para você, no período que escolher.",
      },
    ],
  }),
});

type Period = "hoje" | "semana" | "mes" | "30d";
const PERIOD_LABEL: Record<Period, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  "30d": "Últimos 30 dias",
};

function periodRange(p: Period): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (p === "hoje") return { from: start, to: new Date(start.getTime() + 86400000) };
  if (p === "semana")
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }),
      to: new Date(endOfWeek(now, { weekStartsOn: 1 }).getTime() + 1),
    };
  if (p === "mes") return { from: startOfMonth(now), to: new Date(endOfMonth(now).getTime() + 1) };
  return {
    from: new Date(start.getTime() - 29 * 86400000),
    to: new Date(start.getTime() + 86400000),
  };
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

/**
 * Tela de boas-vindas. O que aparece depende do que a pessoa faz:
 *  - SDR: leads no nome dela, abordagens, agendas marcadas, SLA, pipeline, próximas reuniões
 *  - Executivo: reuniões marcadas para ela, carteira comercial, tarefas
 *  - CS: carteira por sinaleira, tarefas, contatos — e os blocos do dia (tarefas, cadência, alertas, feed)
 *  - Gestão: além das próprias, a tabela do time de SDR e o seletor de pessoa
 */
function WelcomePage() {
  const { user } = useAuth();
  const role = useCurrentRole();
  const fn = useServerFn(getWelcome);
  const [period, setPeriod] = useState<Period>("semana");
  const [who, setWho] = useState<string>("me");
  const range = useMemo(() => periodRange(period), [period]);

  const q = useQuery({
    queryKey: ["welcome", user?.id, period, who],
    queryFn: () =>
      fn({
        data: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          ...(who !== "me" ? { userId: who } : {}),
        },
      }),
    enabled: !!user,
    staleTime: 60_000,
  });
  const d = q.data;
  const viewingSelf = !d || d.viewing.id === d.me.id;
  const firstName = (d?.me.name ?? "").split(" ")[0];

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium capitalize text-muted-foreground">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {greeting(new Date())}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          {d && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {viewingSelf ? null : (
                <span className="text-[12px] text-muted-foreground">Vendo {d.viewing.name} ·</span>
              )}
              {d.viewing.memberships.map((m) => (
                <span
                  key={m.team}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    TEAM_COLORS[m.cor]?.chip ?? TEAM_COLORS.slate.chip
                  }`}
                >
                  {m.team} · {m.access.map(accessLabel).join(", ")}
                </span>
              ))}
              {d.viewing.isManager && d.viewing.memberships.length === 0 && (
                <Badge variant="secondary">Gestão</Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d?.me.isManager && d.pickable.length > 0 && (
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <Users className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Minhas métricas</SelectItem>
                {d.pickable
                  .filter((p) => p.id !== d.me.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      <span className="ml-1 text-muted-foreground">
                        · {p.teams.map((t) => t.access.map(accessLabel).join("/")).join(", ")}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <CalendarClock className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {q.isLoading && <Empty>Carregando suas métricas…</Empty>}
      {q.error && <Empty>{q.error instanceof Error ? q.error.message : "Erro ao carregar"}</Empty>}

      {d &&
        !d.show.sdr &&
        !d.show.executivo &&
        !d.show.cs &&
        !d.show.gestaoSdr &&
        !d.show.gestaoComercial && (
          <Section icon={LifeBuoy} title="Sem time ainda">
            <Empty>
              {viewingSelf
                ? "Seu usuário ainda não está em nenhum time. Peça à gestão para incluir você em Administração → Usuários."
                : "Essa pessoa ainda não está em nenhum time."}
            </Empty>
          </Section>
        )}

      {/* ---------------- SDR ---------------- */}
      {d?.sdr && (
        <Section
          icon={KanbanSquare}
          title={`SDR · ${PERIOD_LABEL[period].toLowerCase()}`}
          to="/kanban"
          toLabel="Ver pipeline"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Leads novos" value={d.sdr.novos} hint="no meu nome" />
            <Metric label="Abordados" value={d.sdr.abordados} hint="1º toque feito" />
            <Metric
              label="Agendas marcadas"
              value={d.sdr.marcadas}
              hint={`taxa ${pct(d.sdr.taxaAgendamento)} dos abordados`}
              tone={d.sdr.marcadas > 0 ? "good" : undefined}
            />
            <Metric
              label="Reuniões no período"
              value={d.sdr.reunioesNoPeriodo}
              hint="pela data da reunião"
            />
            <Metric
              label="SLA 1º toque"
              value={pct(d.sdr.slaDentroPct)}
              hint={
                d.sdr.slaMediaMin !== null
                  ? `média ${d.sdr.slaMediaMin} min · ${d.sdr.slaAmostra} leads`
                  : "sem abordagens no período"
              }
              tone={
                d.sdr.slaDentroPct !== null
                  ? d.sdr.slaDentroPct >= 80
                    ? "good"
                    : "warn"
                  : undefined
              }
            />
            <Metric label="Enviados ao comercial" value={d.sdr.enviadosComercial} />
            <Metric label="Desqualificados" value={d.sdr.perdidos} />
            <Metric
              label="Mensagens WhatsApp"
              value={d.sdr.mensagensWhatsapp}
              hint="enviadas por mim"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="section-label mb-2">Pipeline em aberto · {d.sdr.emAberto} leads</p>
              <ul className="space-y-1.5">
                {d.sdr.pipeline.map((s) => {
                  const w = d.sdr!.emAberto ? Math.round((s.count / d.sdr!.emAberto) * 100) : 0;
                  return (
                    <li key={s.slug} className="flex items-center gap-2 text-[12px]">
                      <span className="w-40 truncate text-muted-foreground">{s.stage}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${w}%` }}
                        />
                      </span>
                      <span className="w-8 text-right tabular-nums">{s.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="section-label mb-2">Próximas reuniões</p>
              {d.sdr.proximasReunioes.length === 0 ? (
                <Empty>Nenhuma reunião marcada daqui pra frente.</Empty>
              ) : (
                <ul className="divide-y">
                  {d.sdr.proximasReunioes.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-2 text-[12px]">
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/lead/$id"
                          params={{ id: m.id }}
                          className="truncate font-medium hover:underline"
                        >
                          {m.company}
                        </Link>
                        <p className="truncate text-muted-foreground">
                          {m.name}
                          {m.executivo ? ` · com ${m.executivo}` : " · executivo a definir"}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(m.meetingAt), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                      <Send
                        className={`h-3.5 w-3.5 ${m.conviteEnviado ? "text-emerald-500" : "text-muted-foreground/40"}`}
                        aria-label={m.conviteEnviado ? "Convite enviado" : "Convite não enviado"}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ---------------- Time de SDR (gestão) ---------------- */}
      {d?.team && (
        <Section
          icon={Users}
          title={`Time de SDR · ${PERIOD_LABEL[period].toLowerCase()}`}
          to="/leads-analytics"
          toLabel="Performance SDR"
        >
          {d.team.length === 0 ? (
            <Empty>Ninguém com acesso SDR no time Comercial ainda.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Pessoa</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Novos</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Abordados</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Agendas</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Taxa</th>
                    <th className="py-1.5 text-right font-medium">SLA 15 min</th>
                  </tr>
                </thead>
                <tbody>
                  {d.team.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5 pr-2">
                        <button
                          type="button"
                          className="font-medium hover:underline"
                          onClick={() => setWho(r.id)}
                        >
                          {r.name}
                        </button>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.novos}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.abordados}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">
                        {r.marcadas}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{pct(r.taxa)}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(r.slaDentroPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* ---------------- Executivo ---------------- */}
      {d?.executivo && (
        <Section
          icon={Handshake}
          title={`Executivo comercial · ${PERIOD_LABEL[period].toLowerCase()}`}
          to="/empresas"
          toLabel="Ver empresas"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric
              label="Agendas marcadas para mim"
              value={d.executivo.marcadasParaMim}
              hint="pelos SDRs"
            />
            <Metric label="Reuniões no período" value={d.executivo.reunioesNoPeriodo} />
            <Metric
              label="Carteira comercial"
              value={d.executivo.carteira.total}
              hint={`${d.executivo.carteira.verde} verde · ${d.executivo.carteira.amarelo} amarelo · ${d.executivo.carteira.vermelho} vermelho`}
              tone={d.executivo.carteira.vermelho ? "warn" : undefined}
            />
            <Metric
              label="Tarefas pendentes"
              value={d.executivo.tarefasPendentes}
              hint={
                d.executivo.tarefasAtrasadas
                  ? `${d.executivo.tarefasAtrasadas} atrasadas`
                  : "nenhuma atrasada"
              }
              tone={d.executivo.tarefasAtrasadas ? "warn" : undefined}
            />
          </div>
          <div className="mt-4">
            <p className="section-label mb-2">Próximas reuniões</p>
            {d.executivo.proximas.length === 0 ? (
              <Empty>Nenhuma reunião marcada para você.</Empty>
            ) : (
              <ul className="divide-y">
                {d.executivo.proximas.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-2 text-[12px]">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/lead/$id"
                        params={{ id: m.id }}
                        className="truncate font-medium hover:underline"
                      >
                        {m.company}
                      </Link>
                      <p className="truncate text-muted-foreground">
                        {m.name}
                        {m.sdr ? ` · marcada por ${m.sdr}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(m.meetingAt), "EEE dd/MM HH:mm", { locale: ptBR })}
                    </span>
                    <Send
                      className={`h-3.5 w-3.5 ${m.conviteEnviado ? "text-emerald-500" : "text-muted-foreground/40"}`}
                      aria-label={m.conviteEnviado ? "Convite enviado" : "Convite não enviado"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      {/* ---------------- Gestão comercial ---------------- */}
      {d?.gestaoComercial && (
        <Section
          icon={Target}
          title={`Comercial · ${d.gestaoComercial.mesLabel}`}
          to="/comercial-analise"
          toLabel="Ver análise"
        >
          <GestaoComercialBloco g={d.gestaoComercial} />
        </Section>
      )}

      {/* ---------------- CS ---------------- */}
      {d?.cs && (
        <Section
          icon={Briefcase}
          title={`Customer Success · ${PERIOD_LABEL[period].toLowerCase()}`}
          to="/cs"
          toLabel="Ver carteira"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric
              label="Minha carteira"
              value={d.cs.carteira.total}
              hint={`${d.cs.carteira.verde} verde · ${d.cs.carteira.amarelo} amarelo · ${d.cs.carteira.vermelho} vermelho`}
              tone={d.cs.carteira.vermelho ? "warn" : undefined}
            />
            <Metric
              label="Contatos no período"
              value={d.cs.contatosNoPeriodo}
              hint={`${d.cs.reunioesNoPeriodo} reuniões`}
            />
            <Metric
              label="Alertas abertos"
              value={d.cs.alertasAbertos}
              tone={d.cs.alertasAbertos ? "warn" : undefined}
            />
            <Metric
              label="Tarefas pendentes"
              value={d.cs.tarefasPendentes}
              hint={
                d.cs.tarefasAtrasadas
                  ? `${d.cs.tarefasAtrasadas} atrasadas`
                  : `${d.cs.reunioesNoPeriodo} reuniões no período`
              }
              tone={d.cs.tarefasAtrasadas ? "warn" : undefined}
            />
          </div>
        </Section>
      )}

      {/* Blocos do dia do CS (sempre sobre a pessoa logada) */}
      {d?.show.cs && viewingSelf && !role.loading && <CsHomeSections />}
    </div>
  );
}

/**
 * O que a gestão comercial olha no mês: quanto entrou, de qual funil, quem
 * puxou e quanto falta para a meta.
 *
 * O mês é fechado de propósito — a meta da empresa é mensal, então o seletor
 * de período do topo não manda neste bloco.
 */
function GestaoComercialBloco({ g }: { g: GestaoComercialMetrics }) {
  const top = g.ranking[0] ?? null;
  const adiantado = g.progressoPct >= g.fracaoDoMesPct;
  const falta = Math.max(0, g.meta - g.realizado);
  const baseLabel = g.base === "faturamento" ? "faturado" : "vendido";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Agendas do time"
          value={g.agendas}
          hint={
            g.agendasPorExecutivo.length
              ? g.agendasPorExecutivo
                  .slice(0, 3)
                  .map((e) => `${e.name.split(" ")[0]} ${e.n}`)
                  .join(" · ")
              : "reuniões dos executivos no mês"
          }
        />
        <Metric
          label={g.base === "faturamento" ? "Faturado no mês" : "Vendido no mês"}
          value={moeda(g.realizado)}
          hint={
            g.base === "faturamento"
              ? `${moeda(g.vendido)} vendido`
              : `${moeda(g.faturado)} faturado`
          }
          tone={adiantado ? "good" : undefined}
        />
        <Metric
          label="Top vendedor"
          value={top ? top.name.split(" ")[0] : "—"}
          hint={
            top ? `${moeda(top.valor)} · ${top.vendas} venda(s)` : `sem venda ${baseLabel} ainda`
          }
        />
        <Metric
          label="Meta do mês"
          value={`${g.progressoPct}%`}
          hint={`${moeda(g.realizado)} de ${moeda(g.meta)}`}
          tone={adiantado ? "good" : "warn"}
        />
      </div>

      {/* A barra compara com o quanto do mês já passou: 60% da meta no dia 10
          é uma notícia diferente de 60% no dia 28. */}
      <div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${adiantado ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${Math.min(100, g.progressoPct)}%` }}
          />
          <div
            className="absolute top-0 h-full w-px bg-foreground/50"
            style={{ left: `${Math.min(100, g.fracaoDoMesPct)}%` }}
            title={`${g.fracaoDoMesPct}% do mês`}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {g.fracaoDoMesPct}% do mês decorrido · faltam {moeda(falta)}
          {g.ganhoSemFaturar > 0 && g.base === "faturamento"
            ? ` · ${moeda(g.ganhoSemFaturar)} vendido aguardando faturamento`
            : ""}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {g.porFunil.map((f) => (
          <div key={f.slug} className="surface-panel p-2.5">
            <p className="truncate text-[11px] font-medium" title={f.nome}>
              {f.nome}
            </p>
            <p className="metric-value mt-0.5 text-lg">
              {moeda(g.base === "faturamento" ? f.faturado : f.vendido)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {f.n} negócio(s)
              {g.base === "faturamento" && f.vendido !== f.faturado
                ? ` · ${moeda(f.vendido)} vendido`
                : ""}
            </p>
          </div>
        ))}
      </div>

      {g.ranking.length > 1 && (
        <div>
          <p className="section-label mb-1 flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" /> Ranking do mês
          </p>
          <ul className="divide-y">
            {g.ranking.map((r, i) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}º</span>
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  {moeda(r.valor)}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {r.vendas} venda(s)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  const ring =
    tone === "good" ? "border-emerald-500/40" : tone === "warn" ? "border-warning/50" : "";
  return (
    <div className={`surface-panel p-3 ${ring}`}>
      <p className="section-label">{label}</p>
      <p className="metric-value mt-1 text-2xl">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
