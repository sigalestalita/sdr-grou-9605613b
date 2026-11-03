import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getInicioAcoes } from "@/lib/inicio-acoes.functions";

/*
 * Topo do Início para quem faz SDR: quatro números grandes e quatro blocos
 * do que fazer agora — responder, reuniões de hoje, leads quentes, tarefas.
 */
type Props = {
  userId?: string;
  agendasNoPeriodo: number;
  periodo: string;
  slaDentroPct: number | null;
};

const PASSO_ROTULO: Record<string, string> = {
  confirmacao: "confirmação",
  material: "material",
  vespera: "véspera",
  vespera_material: "véspera",
  lembrete: "lembrete",
};

export function InicioAcoes({ userId, agendasNoPeriodo, periodo, slaDentroPct }: Props) {
  const fn = useServerFn(getInicioAcoes);
  const q = useQuery({
    queryKey: ["inicio-acoes", userId ?? "me"],
    queryFn: () => fn({ data: userId ? { userId } : {} }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const d = q.data;

  return (
    <div className="space-y-5">
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Numero
          rotulo="Leads sem 1º contato"
          valor={d?.semContato ?? "—"}
          detalhe={
            d
              ? d.semContatoAtrasados
                ? `${d.semContatoAtrasados} passaram de 2h`
                : "todos dentro de 2h"
              : ""
          }
          alerta={!!d?.semContatoAtrasados}
        />
        <Numero
          rotulo="Reuniões hoje"
          valor={d?.reunioesHoje.length ?? "—"}
          detalhe="marcadas por você ou com você"
        />
        <Numero rotulo="Agendas marcadas" valor={agendasNoPeriodo} detalhe={periodo} />
        <Numero
          rotulo="SLA 1º toque"
          valor={slaDentroPct === null ? "—" : `${slaDentroPct}%`}
          detalhe="dentro do prazo no período"
          destaque
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Bloco
          titulo="Responder primeiro"
          subtitulo="Leads sem 1º contato, do mais antigo para o mais recente."
          vazio="Ninguém esperando. Todos os seus leads já tiveram 1º contato."
          itens={d?.responder.length ?? 0}
          carregando={q.isLoading}
        >
          {d?.responder.map((l) => {
            const horas = (Date.now() - Date.parse(l.desde)) / 3600_000;
            return (
              <Linha key={l.id} id={l.id} nome={l.nome} sub={[l.empresa, l.origem]}>
                <Selo tom={horas > 2 ? "alerta" : "ok"}>
                  há {formatDistanceToNowStrict(new Date(l.desde), { locale: ptBR })}
                </Selo>
              </Linha>
            );
          })}
        </Bloco>

        <Bloco
          titulo="Reuniões de hoje"
          subtitulo="E o que a jornada da agenda já mandou ao lead."
          vazio="Nenhuma reunião hoje."
          itens={d?.reunioesHoje.length ?? 0}
          carregando={q.isLoading}
        >
          {d?.reunioesHoje.map((r) => (
            <Linha
              key={r.id}
              id={r.id}
              nome={r.empresa || r.nome}
              sub={[r.executivo ? `com ${r.executivo}` : "executivo a definir"]}
              antes={
                <span className="w-16 shrink-0 text-lg font-bold text-primary">
                  {format(new Date(r.em), "HH'h'mm", { locale: ptBR }).replace("h00", "h")}
                </span>
              }
            >
              <Selo tom={r.jornada.length ? "ok" : "neutro"}>
                {r.jornada.length
                  ? [...new Set(r.jornada.map((p) => PASSO_ROTULO[p] ?? p))].join(" · ")
                  : "sem jornada"}
              </Selo>
            </Linha>
          ))}
        </Bloco>

        <Bloco
          titulo="Leads mais quentes"
          subtitulo="Perfil e interesse: os abertos de maior pontuação."
          vazio="Sem leads pontuados em aberto."
          itens={d?.quentes.length ?? 0}
          carregando={q.isLoading}
        >
          {d?.quentes.map((l) => (
            <Linha key={l.id} id={l.id} nome={l.nome} sub={[l.empresa, l.porte]}>
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, l.score))}%` }}
                  />
                </span>
                <span className="w-7 text-right text-sm font-bold tabular-nums text-primary">
                  {l.score}
                </span>
              </div>
            </Linha>
          ))}
        </Bloco>

        <Bloco
          titulo="Minhas tarefas de hoje"
          subtitulo="Follow-ups vencendo hoje e os atrasados."
          vazio="Nenhum follow-up para hoje."
          itens={d?.tarefas.length ?? 0}
          carregando={q.isLoading}
        >
          {d?.tarefas.map((t) => (
            <Linha
              key={t.id}
              id={t.id}
              nome={t.acao || "Follow-up"}
              sub={[t.nome, t.empresa]}
              destaque
            >
              <Selo tom={t.atrasada ? "alerta" : "neutro"}>
                {t.atrasada
                  ? `atrasada · ${format(new Date(t.quando), "dd/MM")}`
                  : format(new Date(t.quando), "HH:mm")}
              </Selo>
            </Linha>
          ))}
        </Bloco>
      </section>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  alerta,
  destaque,
}: {
  rotulo: string;
  valor: number | string;
  detalhe: string;
  alerta?: boolean;
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-[22px] p-5 shadow-[var(--shadow-soft)] ${
        destaque ? "bg-[#05104c] text-white dark:bg-card dark:text-foreground" : "bg-card"
      }`}
    >
      <span
        className={`text-[11px] font-bold tracking-[0.14em] uppercase ${
          destaque ? "text-[#88d5ce]" : "text-muted-foreground"
        }`}
      >
        {rotulo}
      </span>
      <span
        className={`text-[38px] leading-none font-bold tracking-tight tabular-nums ${
          alerta ? "text-destructive" : destaque ? "" : "text-primary"
        }`}
      >
        {valor}
      </span>
      <span
        className={`text-[13px] ${destaque ? "text-[#c9d2ea] dark:text-muted-foreground" : "text-muted-foreground"}`}
      >
        {detalhe}
      </span>
    </div>
  );
}

function Bloco({
  titulo,
  subtitulo,
  vazio,
  itens,
  carregando,
  children,
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  itens: number;
  carregando: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[24px] bg-card p-6 shadow-[var(--shadow-soft)]">
      <div>
        <h2 className="text-lg font-bold text-primary">{titulo}</h2>
        <p className="text-[13px] text-muted-foreground">{subtitulo}</p>
      </div>
      {carregando ? (
        <p className="py-3 text-[13px] text-muted-foreground">Carregando…</p>
      ) : itens === 0 ? (
        <p className="py-3 text-[13px] text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </div>
  );
}

function Linha({
  id,
  nome,
  sub,
  antes,
  destaque,
  children,
}: {
  id: string;
  nome: string | null;
  sub: Array<string | null | undefined>;
  antes?: React.ReactNode;
  destaque?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        to="/lead/$id"
        params={{ id }}
        className="flex items-center gap-4 py-3 transition-colors hover:text-primary"
      >
        {antes}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-[15px] font-semibold ${destaque ? "text-primary" : ""}`}>
            {nome || "Sem nome"}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {sub.filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
        {children}
      </Link>
    </li>
  );
}

function Selo({ tom, children }: { tom: "ok" | "alerta" | "neutro"; children: React.ReactNode }) {
  const cor =
    tom === "alerta"
      ? "bg-destructive/10 text-destructive"
      : tom === "ok"
        ? "bg-[#88d5ce]/25 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${cor}`}>
      {children}
    </span>
  );
}
