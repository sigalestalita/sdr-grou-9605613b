import { Clock } from "lucide-react";
import { chaveDoDia, completar, pesoDaPrioridade, type PassoCompleto } from "@/lib/fup-agenda";
import { IconeDoCanal } from "./canal";
import { nomeDoCanal } from "./formatos";
import { hhmm } from "./formatos";
import { NomeDoLead, PontoDePrioridade } from "./partes";
import type { Compromisso, LinhaDeCadencia } from "./tipos";

const ROTULO_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Estado = "feito" | "atrasado" | "hoje" | "previsto";

const COR_DO_ESTADO: Record<Estado, string> = {
  feito: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  atrasado: "bg-destructive/12 text-destructive",
  hoje: "bg-primary/12 text-primary",
  previsto: "bg-muted text-muted-foreground",
};

const NOME_DO_ESTADO: Record<Estado, string> = {
  feito: "Feito",
  atrasado: "Atrasado",
  hoje: "Hoje",
  previsto: "Previsto",
};

type Linha = {
  leadId: string;
  nome: string;
  empresa: string | null;
  prioridade: string | null;
  dono: string;
  porDia: Map<string, { passos: PassoCompleto[]; compromissos: Compromisso[] }>;
  primeiro: string;
};

/**
 * A semana para planejar, não para executar: lead nas linhas, dia nas colunas.
 *
 * É o que resolve o "mesmo lead em vários cards". Um lead com toque na terça,
 * quarta e sexta ocupa uma linha só, e o espalhamento dele pela semana vira
 * informação — dá para ver de relance que a quarta está pesada e a segunda
 * vazia, que é a pergunta de quem planeja.
 */
export function MatrizDaSemana({
  dias,
  linhas,
  compromissos,
  mostrarDono,
  agora,
}: {
  dias: Date[];
  linhas: LinhaDeCadencia[];
  compromissos: Compromisso[];
  mostrarDono: boolean;
  agora: Date;
}) {
  const hoje = chaveDoDia(agora);
  const chaves = dias.map(chaveDoDia);
  const daSemana = new Set(chaves);

  const porLead = new Map<string, Linha>();
  const linhaDe = (base: Omit<Linha, "porDia" | "primeiro">) => {
    const atual = porLead.get(base.leadId);
    if (atual) return atual;
    const nova: Linha = { ...base, porDia: new Map(), primeiro: "9999" };
    porLead.set(base.leadId, nova);
    return nova;
  };
  const celula = (linha: Linha, dia: string) => {
    const atual = linha.porDia.get(dia);
    if (atual) return atual;
    const nova = { passos: [] as PassoCompleto[], compromissos: [] as Compromisso[] };
    linha.porDia.set(dia, nova);
    return nova;
  };

  for (const { lead } of linhas) {
    const doLead = lead.passos
      .map(completar)
      .filter((p): p is PassoCompleto => !!p && daSemana.has(chaveDoDia(p.dueAt)));
    if (doLead.length === 0) continue;
    const linha = linhaDe({
      leadId: lead.leadId,
      nome: lead.leadName,
      empresa: lead.company,
      prioridade: lead.priority,
      dono: lead.assignedName,
    });
    for (const p of doLead) {
      celula(linha, chaveDoDia(p.dueAt)).passos.push(p);
      if (p.dueAt < linha.primeiro) linha.primeiro = p.dueAt;
    }
  }
  for (const c of compromissos) {
    const dia = chaveDoDia(c.dueAt);
    if (!daSemana.has(dia)) continue;
    const linha = linhaDe({
      leadId: c.leadId,
      nome: c.leadName,
      empresa: c.company,
      prioridade: c.priority,
      dono: c.assignedName,
    });
    celula(linha, dia).compromissos.push(c);
    if (c.dueAt < linha.primeiro) linha.primeiro = c.dueAt;
  }

  const ordenadas = [...porLead.values()].sort(
    (a, b) =>
      a.primeiro.localeCompare(b.primeiro) ||
      pesoDaPrioridade(a.prioridade) - pesoDaPrioridade(b.prioridade) ||
      a.nome.localeCompare(b.nome),
  );

  // Fim de semana só aparece se tiver alguma coisa: a trilha não marca mais
  // passo em sábado e domingo, e duas colunas vazias só apertam as outras.
  const visiveis = dias
    .map((d, i) => ({ data: d, chave: chaves[i] }))
    .filter(
      ({ data, chave }) =>
        (data.getDay() !== 0 && data.getDay() !== 6) || ordenadas.some((l) => l.porDia.has(chave)),
    );

  const estadoDe = (p: PassoCompleto, dia: string): Estado =>
    p.doneAt ? "feito" : dia < hoje ? "atrasado" : dia === hoje ? "hoje" : "previsto";

  const aFazer = (chave: string) =>
    ordenadas.reduce((n, l) => {
      const c = l.porDia.get(chave);
      if (!c) return n;
      return (
        n + c.passos.filter((p) => !p.doneAt).length + c.compromissos.filter((x) => !x.done).length
      );
    }, 0);

  if (ordenadas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhum toque nesta semana.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {(Object.keys(NOME_DO_ESTADO) as Estado[]).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${COR_DO_ESTADO[e]}`} />
            {NOME_DO_ESTADO[e]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> Hora marcada
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-10 w-56 bg-muted/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Lead · {ordenadas.length}
              </th>
              {visiveis.map(({ data, chave }) => (
                <th
                  key={chave}
                  className={`px-2 py-2 text-[11px] font-semibold ${
                    chave === hoje ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {ROTULO_DIA[data.getDay()]} {data.getDate()}/{data.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => (
              <tr
                key={l.leadId}
                className="border-b border-border last:border-b-0 hover:bg-muted/30"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-3 py-2 align-top font-normal"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5">
                      <PontoDePrioridade prioridade={l.prioridade} />
                    </span>
                    <div className="min-w-0 max-w-[12rem]">
                      <NomeDoLead
                        leadId={l.leadId}
                        nome={l.nome}
                        empresa={mostrarDono ? `${l.empresa ?? "—"} · ${l.dono}` : l.empresa}
                      />
                    </div>
                  </div>
                </th>
                {visiveis.map(({ chave }) => {
                  const c = l.porDia.get(chave);
                  return (
                    <td
                      key={chave}
                      className={`px-2 py-2 align-top ${chave === hoje ? "bg-primary/[0.04]" : ""}`}
                    >
                      {c && (
                        <div className="flex flex-wrap gap-1">
                          {c.passos.map((p) => {
                            const estado = estadoDe(p, chave);
                            return (
                              <span
                                key={p.id}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded ${COR_DO_ESTADO[estado]}`}
                                title={`Dia ${p.day} · ${nomeDoCanal(p)} — ${p.title} (${NOME_DO_ESTADO[estado].toLowerCase()})`}
                              >
                                <IconeDoCanal passo={p} />
                                <span className="sr-only">
                                  {nomeDoCanal(p)}, {NOME_DO_ESTADO[estado]}
                                </span>
                              </span>
                            );
                          })}
                          {c.compromissos.map((x) => (
                            <span
                              key={x.key}
                              className={`inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] tabular-nums ${
                                x.done
                                  ? COR_DO_ESTADO.feito
                                  : chave < hoje
                                    ? COR_DO_ESTADO.atrasado
                                    : "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                              }`}
                              title={`${x.title}${x.subtitle ? ` · ${x.subtitle}` : ""}`}
                            >
                              <Clock className="h-3 w-3" />
                              {hhmm(x.dueAt)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/95 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                A fazer no dia
              </th>
              {visiveis.map(({ chave }) => (
                <td
                  key={chave}
                  className={`px-2 py-2 text-[12px] font-semibold tabular-nums ${
                    chave === hoje ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {aFazer(chave) || "—"}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
