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
