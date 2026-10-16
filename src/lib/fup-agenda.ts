/**
 * Regra de quais passos da trilha entram na Agenda de FUPs.
 * Pura, sem banco — mora fora do .functions.ts para poder ser testada.
 */
import type { CadencePlan, CadenceStepState } from "./sdr-cadence";

/**
 * Os passos acionáveis de um lead numa semana.
 *
 * Acionável não é "todo passo pendente": um lead largado há duas semanas tem
 * cinco ou seis passos vencidos, e despejar todos encheria a tela de ruído — a
 * SDR não vai fazer os cinco, vai retomar do próximo. Então entra o primeiro
 * vencido, que é o ponto de retomada, mais os passos que caem dentro da semana
 * visível.
 *
 * O deduplicar no fim é o que faltava e desenhou card repetido em produção:
 * "vencido" é medido contra agora, "na semana" contra o domingo, e um passo de
 * terça visto na sexta satisfaz os dois.
 */
export function passosDaAgenda(
  plan: Pick<CadencePlan, "steps" | "firstLateStep">,
  from: string,
  to: string,
): CadenceStepState[] {
  const naSemana = plan.steps.filter((p) => !p.done && p.dueAt >= from && p.dueAt <= to);
  const vencido = plan.firstLateStep;
  if (!vencido || vencido.done) return naSemana;
  if (naSemana.some((p) => p.id === vencido.id)) return naSemana;
  return [vencido, ...naSemana];
}

/**
 * Agrupa os passos de um lead por dia.
 *
 * Cada "Dia" da trilha tem mais de um toque — WhatsApp, e-mail e ligação, por
 * exemplo — e a agenda desenhava um card para cada um. O resultado é o mesmo
 * lead ocupando quatro cards na quarta-feira e a SDR achando, com razão, que a
 * tela estava repetindo. Um card por lead por dia; os toques daquele dia vão
 * dentro dele.
 */
export function agruparPorDia(passos: CadenceStepState[]): CadenceStepState[][] {
  const porDia = new Map<string, CadenceStepState[]>();
  for (const passo of passos) {
    const dia = passo.dueAt.slice(0, 10);
    const atual = porDia.get(dia);
    if (atual) atual.push(passo);
    else porDia.set(dia, [passo]);
  }
  return [...porDia.values()];
}
