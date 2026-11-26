import { URGENCY_ORDER, type CadencePlan } from "./cadence";

/**
 * Agenda da semana de cada analista de CS no kanban de cadência.
 *
 * Regra da gestão: cada CS faz exatamente 8 atendimentos por dia, nem mais nem
 * menos. A semana de cada analista é montada assim:
 *  1. O que já está salvo para a semana (concluído ou movido à mão) fica no dia
 *     em que está, até 8 por dia; o que passar disso vai para o dia livre mais
 *     perto.
 *  2. Os demais clientes da carteira entram por prioridade: primeiro os que
 *     estão devidos pela cadência (urgência, dias de atraso), depois os que
 *     vencem antes — assim um dia nunca fica com menos de 8 enquanto houver
 *     cliente na carteira. Cada um vai para o dia sugerido pela cadência ou,
 *     se ele estiver cheio, para o dia livre mais perto.
 *  3. Com os 5 dias cheios (40 atendimentos), o resto fica para a semana
 *     seguinte.
 * Carteira com menos de 40 clientes não completa os 8 por dia: não há quem pôr.
 *
 * Dia que já passou não recebe card novo (nasceria atrasado): na semana atual
 * a agenda nova começa hoje; numa semana passada, só fica o que estava salvo.
 */

export const ATENDIMENTOS_POR_DIA = 8;
export const DIAS_UTEIS = [1, 2, 3, 4, 5] as const;

type PlanoMinimo = Pick<
  CadencePlan,
  "due" | "urgency" | "overdueDays" | "dueAt" | "daysSinceContact" | "suggestedWeekday"
>;

export type LinhaDaCarteira = { clientUid: string; ownerId: string | null; plan: PlanoMinimo };
export type TarefaSalva = {
  clientUid: string;
  weekday: number;
  done: boolean;
  ownerId: string | null;
};

export type ItemDaSemana = {
  clientUid: string;
  ownerId: string;
  weekday: number;
  done: boolean;
  /** Já está salvo na semana (não precisa ser gravado de novo). */
  salvo: boolean;
};

/** Quem vem antes na fila de atendimento. */
export function compararPrioridade(a: PlanoMinimo, b: PlanoMinimo): number {
  if (a.due !== b.due) return a.due ? -1 : 1;
  const ua = URGENCY_ORDER.indexOf(a.urgency);
  const ub = URGENCY_ORDER.indexOf(b.urgency);
  if (ua !== ub) return ua - ub;
  if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
  const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  // Sem contato registrado vem primeiro; depois quem está há mais tempo sem.
  const sa = a.daysSinceContact ?? Number.POSITIVE_INFINITY;
  const sb = b.daysSinceContact ?? Number.POSITIVE_INFINITY;
  return sb - sa;
}

/**
 * Primeiro dia útil da semana que ainda aceita card novo: 1 numa semana
 * futura, o dia de hoje na semana atual (6 no fim de semana) e 6 numa semana
 * que já passou — 6 quer dizer nenhum. Datas no fuso do navegador.
 */
export function primeiroDiaComVagaNova(weekStart: string, hoje: Date = new Date()): number {
  const ymd = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
    hoje.getDate(),
  ).padStart(2, "0")}`;
  const dias = Math.round(
    (Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86400000,
  );
  if (dias < 0) return 1;
  return Math.min(dias + 1, 6);
}

/** Dia com vaga mais perto do preferido, a partir de `minimo` (empate: o dia seguinte). */
function diaComVaga(
  preferido: number,
  ocupacao: Record<number, number>,
  porDia: number,
  minimo = 1,
) {
  const base = DIAS_UTEIS.includes(preferido as 1) ? Math.max(preferido, minimo) : minimo;
  for (let dist = 0; dist < DIAS_UTEIS.length; dist++) {
    for (const d of [base + dist, base - dist]) {
      if (d >= minimo && d <= 5 && (ocupacao[d] ?? 0) < porDia) return d;
    }
  }
  return null;
}

export function montarSemana(
  linhas: LinhaDaCarteira[],
  tarefas: TarefaSalva[],
  porDia: number = ATENDIMENTOS_POR_DIA,
  /** Primeiro dia que recebe card novo (ver primeiroDiaComVagaNova). */
  primeiroDia = 1,
): ItemDaSemana[] {
  const tarefaPorCliente = new Map(tarefas.map((t) => [t.clientUid, t]));
  const porDono = new Map<string, LinhaDaCarteira[]>();
  for (const l of linhas) {
    const dono = tarefaPorCliente.get(l.clientUid)?.ownerId ?? l.ownerId;
    if (!dono) continue; // cliente sem CS não entra na agenda de ninguém
    const lista = porDono.get(dono) ?? [];
    lista.push(l);
    porDono.set(dono, lista);
  }

  const saida: ItemDaSemana[] = [];
  for (const [dono, carteira] of porDono) {
    const ocupacao: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const salvas = carteira
      .filter((l) => tarefaPorCliente.has(l.clientUid))
      .sort((a, b) => {
        const ta = tarefaPorCliente.get(a.clientUid)!;
        const tb = tarefaPorCliente.get(b.clientUid)!;
        if (ta.done !== tb.done) return ta.done ? -1 : 1;
        return compararPrioridade(a.plan, b.plan);
      });
    const sobras: LinhaDaCarteira[] = [];
    for (const l of salvas) {
      const t = tarefaPorCliente.get(l.clientUid)!;
      const d = DIAS_UTEIS.includes(t.weekday as 1) ? t.weekday : 1;
      if (ocupacao[d] < porDia) {
        ocupacao[d]++;
        saida.push({
          clientUid: l.clientUid,
          ownerId: dono,
          weekday: d,
          done: t.done,
          salvo: true,
        });
      } else {
        sobras.push(l);
      }
    }
    // Tarefa salva num dia que já estourou vai para o dia livre mais perto.
    for (const l of sobras) {
      const t = tarefaPorCliente.get(l.clientUid)!;
      const d = diaComVaga(t.weekday, ocupacao, porDia, primeiroDia);
      if (d === null) break;
      ocupacao[d]++;
      saida.push({
        clientUid: l.clientUid,
        ownerId: dono,
        weekday: d,
        done: t.done,
        salvo: d === t.weekday,
      });
    }

    const fila = carteira
      .filter((l) => !tarefaPorCliente.has(l.clientUid))
      .sort((a, b) => compararPrioridade(a.plan, b.plan));
    for (const l of fila) {
      const d = diaComVaga(l.plan.suggestedWeekday, ocupacao, porDia, primeiroDia);
      if (d === null) break;
      ocupacao[d]++;
      saida.push({ clientUid: l.clientUid, ownerId: dono, weekday: d, done: false, salvo: false });
    }
  }
  return saida;
}
