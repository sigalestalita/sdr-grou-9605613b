import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeAutoFup, getFupAgenda } from "@/lib/fup-agenda.functions";
import { setFollowUpDone } from "@/lib/touches.functions";
import { completeCadenceStep, retomarCadencia, setLeadCadence } from "@/lib/sdr-cadence.functions";
import { chaveDoDia, ordenarFilaDeHoje, situacaoDoLead } from "@/lib/fup-agenda";
import { FilaDeHoje } from "@/components/agenda/fila-hoje";
import { MatrizDaSemana } from "@/components/agenda/matriz-semana";
import { ListaDeAtrasados } from "@/components/agenda/lista-atrasados";
import type { Compromisso } from "@/components/agenda/tipos";

export const Route = createFileRoute("/_app/agenda")({
  component: AgendaPage,
  head: () => ({
    meta: [
      { title: "Agenda de FUPs | Grou Compass" },
      {
        name: "description",
        content:
          "O dia da SDR em uma fila: os toques de hoje por lead, a semana em uma linha por lead e o que ficou para trás.",
      },
      { property: "og:title", content: "Agenda de FUPs | Grou Compass" },
      {
        property: "og:description",
        content: "Fila de toques do dia, planejamento da semana e cadências paradas, por SDR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Aba = "hoje" | "semana" | "atrasados";
const ABAS: Aba[] = ["hoje", "semana", "atrasados"];
const CHAVE_ABA = "agenda-aba";

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function AgendaPage() {
  const agendaFn = useServerFn(getFupAgenda);
  const doneFn = useServerFn(setFollowUpDone);
  const autoDoneFn = useServerFn(completeAutoFup);
  const passoFn = useServerFn(completeCadenceStep);
  const retomarFn = useServerFn(retomarCadencia);
  const cadenciaFn = useServerFn(setLeadCadence);
  const qc = useQueryClient();

  const [owner, setOwner] = useState<string>("me");
  const [aba, setAba] = useState<Aba>("hoje");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  // A aba fica lembrada: quem planeja a semana toda segunda não quer cair na
  // fila de hoje a cada recarregamento, e vice-versa.
  useEffect(() => {
    try {
      const v = localStorage.getItem(CHAVE_ABA);
      if (v && (ABAS as string[]).includes(v)) setAba(v as Aba);
    } catch {
      // janela anônima ou storage bloqueado: fica em "hoje"
    }
  }, []);
  const escolherAba = (v: Aba) => {
    setAba(v);
    try {
      localStorage.setItem(CHAVE_ABA, v);
    } catch {
      // idem
    }
  };

  // Hoje e Atrasados são sempre sobre agora; só a Semana navega no calendário.
  const semanaDaConsulta = aba === "semana" ? weekStart : startOfWeek(new Date());
  const from = semanaDaConsulta.toISOString();
  const to = addDays(semanaDaConsulta, 7).toISOString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["fup-agenda", from],
    queryFn: () => agendaFn({ data: { from, to } }),
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["fup-agenda"] });
    qc.invalidateQueries({ queryKey: ["lead-touches"] });
    qc.invalidateQueries({ queryKey: ["kanban"] });
  };
  const falhou = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro");

  const concluirCompromisso = useMutation({
    mutationFn: async (item: Compromisso) => {
      if (item.kind === "auto") {
        await autoDoneFn({ data: { enrollmentId: item.key.replace("auto:", "") } });
      } else if (item.kind === "touch") {
        await doneFn({ data: { leadId: item.leadId, touchId: item.touchId!, done: !item.done } });
      } else {
        await doneFn({ data: { leadId: item.leadId, done: true } });
      }
    },
    onSuccess: () => {
      toast.success("Follow-up atualizado");
      invalidar();
    },
    onError: falhou,
  });

  const concluirPasso = useMutation({
    mutationFn: (v: { leadId: string; stepId: string }) => passoFn({ data: v }),
    onSuccess: () => {
      toast.success("Toque registrado");
      invalidar();
    },
    onError: falhou,
  });

  const retomar = useMutation({
    mutationFn: (leadId: string) => retomarFn({ data: { leadId } }),
    onSuccess: (r) => {
      toast.success(`Cadência retomada — o Dia ${r.dia} entra na fila de hoje`);
      invalidar();
    },
    onError: falhou,
  });

  const encerrar = useMutation({
    mutationFn: (leadId: string) => cadenciaFn({ data: { leadId, status: "encerrada" } }),
    onSuccess: () => {
      toast.success("Cadência encerrada");
      invalidar();
    },
    onError: falhou,
  });

  const assignedTo =
    owner === "all" ? null : owner === "me" ? (data?.currentUserId ?? null) : owner;
  const nomeDaSdr = useMemo(() => {
    const id = assignedTo ?? data?.currentUserId;
    const p = data?.profiles.find((x) => x.id === id);
    return p?.full_name ?? null;
  }, [assignedTo, data]);

  const visao = useMemo(() => {
    const agora = new Date();
    const hoje = chaveDoDia(agora);
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const doDono = <T extends { assignedTo: string | null }>(rows: T[]) =>
      assignedTo ? rows.filter((r) => r.assignedTo === assignedTo) : rows;

    const compromissos = doDono([...(data?.overdue ?? []), ...(data?.scheduled ?? [])]);
    const linhas = doDono(data?.cadencia ?? []).map((lead) => ({
      lead,
      situacao: situacaoDoLead(lead, agora),
    }));

    const compromissosDeHoje = compromissos
      .filter((c) => chaveDoDia(c.dueAt) === hoje)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.dueAt.localeCompare(b.dueAt));
    const compromissosAtrasados = compromissos
      .filter((c) => !c.done && new Date(c.dueAt) < inicioHoje)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const filaDeHoje = ordenarFilaDeHoje(linhas.filter((l) => l.situacao.hoje.length > 0));
    const parados = linhas.filter((l) => l.situacao.vencidos.length > 0);

    const naSemana = (iso: string) => iso >= from && iso < to;
    const toquesPendentesHoje =
      filaDeHoje.reduce((n, l) => n + l.situacao.hoje.filter((p) => !p.doneAt).length, 0) +
      compromissosDeHoje.filter((c) => !c.done).length;
    const pendentesNaSemana =
      linhas.reduce(
        (n, l) => n + l.lead.passos.filter((p) => !p.doneAt && naSemana(p.dueAt)).length,
        0,
      ) + compromissos.filter((c) => !c.done && naSemana(c.dueAt)).length;
    const realizadosNaSemana =
      linhas.reduce(
        (n, l) => n + l.lead.passos.filter((p) => p.doneAt && naSemana(p.doneAt)).length,
        0,
      ) + compromissos.filter((c) => c.done && naSemana(c.doneAt ?? c.dueAt)).length;

    return {
      agora,
      linhas,
      compromissos,
      compromissosDeHoje,
      compromissosAtrasados,
      filaDeHoje,
      parados,
      kpi: {
        hoje: toquesPendentesHoje,
        leadsHoje: filaDeHoje.filter((l) => l.situacao.hoje.some((p) => !p.doneAt)).length,
        atrasados: parados.length + compromissosAtrasados.length,
        pendentesNaSemana,
        realizadosNaSemana,
      },
    };
  }, [data, assignedTo, from, to]);

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(semanaDaConsulta, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from],
  );
  const mostrarDono = owner === "all";

  const passoEmAndamento = concluirPasso.isPending
    ? `${concluirPasso.variables?.leadId}:${concluirPasso.variables?.stepId}`
    : null;
  const leadEmAndamento = retomar.isPending
    ? (retomar.variables ?? null)
    : encerrar.isPending
      ? (encerrar.variables ?? null)
      : null;
  const compromissoEmAndamento = concluirCompromisso.isPending
    ? (concluirCompromisso.variables?.key ?? null)
    : null;

  const rotuloSemana = `${dias[0].getDate()}/${dias[0].getMonth() + 1} – ${dias[6].getDate()}/${dias[6].getMonth() + 1}`;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDays className="h-5 w-5" /> Agenda de FUPs
          </h1>
          <p className="text-sm text-muted-foreground">
            Os toques de hoje em ordem de urgência, a semana em uma linha por lead e o que ficou
            para trás.
          </p>
        </div>
        <select
          id="agenda-dono"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="De quem é a agenda"
        >
          <option value="me">Minha agenda</option>
          <option value="all">Todos os SDRs</option>
          {(data?.profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Para hoje"
          valor={visao.kpi.hoje}
          detalhe={`${visao.kpi.leadsHoje} ${visao.kpi.leadsHoje === 1 ? "lead" : "leads"}`}
          ativo={aba === "hoje"}
          onClick={() => escolherAba("hoje")}
        />
        <Indicador
          rotulo="Atrasados"
          valor={visao.kpi.atrasados}
          detalhe="leads e horários"
          tom="perigo"
          ativo={aba === "atrasados"}
          onClick={() => escolherAba("atrasados")}
        />
        <Indicador
          rotulo="Pendentes na semana"
          valor={visao.kpi.pendentesNaSemana}
          detalhe="toques"
          ativo={aba === "semana"}
          onClick={() => escolherAba("semana")}
        />
        <Indicador
          rotulo="Feitos na semana"
          valor={visao.kpi.realizadosNaSemana}
          detalhe="toques"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Visão da agenda"
          className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {(
            [
              ["hoje", "Hoje", visao.kpi.hoje],
              ["semana", "Semana", null],
              ["atrasados", "Atrasados", visao.kpi.atrasados],
            ] as const
          ).map(([valor, rotulo, contagem]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => escolherAba(valor)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                aba === valor
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {rotulo}
              {contagem != null && contagem > 0 && (
                <span
                  className={`ml-1.5 tabular-nums ${valor === "atrasados" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {contagem}
                </span>
              )}
            </button>
          ))}
        </div>

        {aba === "semana" && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] tabular-nums text-muted-foreground">{rotuloSemana}</span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Semana anterior"
              onClick={() => setWeekStart((w) => addDays(w, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Esta semana
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Próxima semana"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium">A agenda não carregou</p>
          <pre className="overflow-x-auto text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </pre>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : aba === "hoje" ? (
        <FilaDeHoje
          linhas={visao.filaDeHoje}
          compromissos={visao.compromissosDeHoje}
          mostrarDono={mostrarDono}
          nomeDaSdr={nomeDaSdr}
          atrasados={visao.kpi.atrasados}
          passoEmAndamento={passoEmAndamento}
          compromissoEmAndamento={compromissoEmAndamento}
          onConcluirPasso={(leadId, stepId) => concluirPasso.mutate({ leadId, stepId })}
          onConcluirCompromisso={(item) => concluirCompromisso.mutate(item)}
          onVerAtrasados={() => escolherAba("atrasados")}
        />
      ) : aba === "semana" ? (
        <MatrizDaSemana
          dias={dias}
          linhas={visao.linhas}
          compromissos={visao.compromissos}
          mostrarDono={mostrarDono}
          agora={visao.agora}
        />
      ) : (
        <ListaDeAtrasados
          linhas={visao.parados}
          compromissos={visao.compromissosAtrasados}
          mostrarDono={mostrarDono}
          emAndamento={leadEmAndamento}
          compromissoEmAndamento={compromissoEmAndamento}
          onRetomar={(leadId) => retomar.mutate(leadId)}
          onEncerrar={(leadId) => encerrar.mutate(leadId)}
          onConcluirCompromisso={(item) => concluirCompromisso.mutate(item)}
        />
      )}
    </div>
  );
}

/** Número do topo. Os três primeiros levam à aba que explicam. */
function Indicador({
  rotulo,
  valor,
  detalhe,
  tom,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  tom?: "perigo";
  ativo?: boolean;
  onClick?: () => void;
}) {
  const conteudo = (
    <>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={`text-2xl font-bold tabular-nums ${tom === "perigo" && valor > 0 ? "text-destructive" : ""}`}
      >
        {valor}
      </p>
      <p className="text-[11px] text-muted-foreground">{detalhe}</p>
    </>
  );
  const base = "rounded-xl border bg-card p-4 text-left";
  if (!onClick) return <div className={`${base} border-border`}>{conteudo}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`${base} transition-colors hover:border-primary/40 ${ativo ? "border-primary/60 ring-1 ring-primary/30" : "border-border"}`}
    >
      {conteudo}
    </button>
  );
}
