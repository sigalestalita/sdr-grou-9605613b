/**
 * Regras da Agenda de FUPs — puras, sem banco, para poderem ser testadas e
 * usadas tanto no servidor quanto na tela.
 *
 * A agenda trabalha com um objeto por lead, nunca com um card por toque. A
 * versão anterior desenhava cada toque da trilha como um card na coluna do
 * dia, e o mesmo lead aparecia quatro vezes numa quarta-feira e de novo na
 * quinta e na sexta. A SDR não conseguia responder a pergunta que ela faz de
 * manhã: quem eu toco agora, e por qual canal.
 */
import { ALL_STEPS_BY_ID, type CadenceStep, type SdrTrack } from "./sdr-playbook";

const DIA_MS = 86_400_000;
/** Brasília, sem horário de verão desde 2019. */
const BRASILIA_MS = -3 * 3_600_000;

/** Um passo da trilha como viaja do servidor: só o que muda de lead para lead. */
export type PassoResumo = {
  id: string;
  dueAt: string;
  /** Quando o toque foi registrado; null enquanto pendente. */
  doneAt: string | null;
};

export type LeadNaCadencia = {
  leadId: string;
  leadName: string;
  company: string | null;
  phone: string | null;
  priority: string | null;
  stageName: string | null;
  assignedTo: string | null;
  assignedName: string;
  touchCount: number;
  track: SdrTrack;
  passos: PassoResumo[];
};

/** O passo com o texto do playbook — título, canal, roteiro — anexado. */
export type PassoCompleto = PassoResumo & CadenceStep;

export function completar(passo: PassoResumo): PassoCompleto | null {
  const base = ALL_STEPS_BY_ID[passo.id];
  return base ? { ...base, ...passo } : null;
}

/** Chave de dia no fuso de quem está olhando — é o dia que a SDR enxerga. */
export function chaveDoDia(instante: string | Date): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function inicioDoDia(agora: Date): number {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type SituacaoDoLead = {
  /** Toques do dia de hoje, feitos e pendentes, na ordem da trilha. */
  hoje: PassoCompleto[];
  /** Pendentes que venceram antes de hoje. */
  vencidos: PassoCompleto[];
  /** O primeiro pendente depois de hoje — o "depois" da fila. */
  depois: PassoCompleto | null;
  /** O primeiro pendente de todos: é dele que a trilha retoma. */
  proximo: PassoCompleto | null;
  /** Dias desde que o primeiro passo vencido deveria ter sido feito. */
  diasParado: number;
  feitos: number;
  total: number;
  /** O "N" de "Dia 3 de N": o dia do último passo da trilha. */
  ultimoDia: number;
};

export function situacaoDoLead(lead: LeadNaCadencia, agora: Date): SituacaoDoLead {
  const hojeChave = chaveDoDia(agora);
  const inicioHoje = inicioDoDia(agora);
  const passos = lead.passos
    .map(completar)
    .filter((p): p is PassoCompleto => p !== null)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  const pendentes = passos.filter((p) => !p.doneAt);
  const vencidos = pendentes.filter((p) => new Date(p.dueAt).getTime() < inicioHoje);
  const primeiroVencido = vencidos[0];

  return {
    hoje: passos.filter((p) => chaveDoDia(p.dueAt) === hojeChave),
    vencidos,
    depois: pendentes.find((p) => chaveDoDia(p.dueAt) > hojeChave) ?? null,
    proximo: pendentes[0] ?? null,
    diasParado: primeiroVencido
      ? Math.max(
          1,
          Math.floor((inicioHoje - new Date(primeiroVencido.dueAt).getTime()) / DIA_MS) + 1,
        )
      : 0,
    feitos: passos.length - pendentes.length,
    total: passos.length,
    ultimoDia: passos.reduce((m, p) => Math.max(m, p.day), 0),
  };
}

const PESO_PRIORIDADE: Record<string, number> = {
  alta: 0,
  media: 1,
  baixa: 2,
  pendente: 3,
  fora_icp: 4,
};

export function pesoDaPrioridade(prioridade: string | null): number {
  return prioridade ? (PESO_PRIORIDADE[prioridade] ?? 5) : 5;
}

/** O toque tem prazo de SLA (o primeiro contato do inbound, em até 15 min). */
export function temSla(passo: Pick<CadenceStep, "channelTag">): boolean {
  return /SLA/i.test(passo.channelTag);
}

/**
 * Ordem da fila de hoje: de cima para baixo é a ordem em que a SDR trabalha.
 *
 * Primeiro quem tem SLA correndo hoje — é o único toque cujo atraso se mede em
 * minutos. Depois a prioridade do lead. Por fim, o horário do primeiro toque
 * pendente, e o nome só para a ordem não pular entre recarregamentos.
 */
export function ordenarFilaDeHoje<T extends { lead: LeadNaCadencia; situacao: SituacaoDoLead }>(
  linhas: T[],
): T[] {
  const chave = (l: T) => {
    const pendentesHoje = l.situacao.hoje.filter((p) => !p.doneAt);
    return {
      // Lead com tudo feito hoje desce para o fim: já saiu do caminho.
      resolvido: pendentesHoje.length === 0 ? 1 : 0,
      sla: pendentesHoje.some(temSla) ? 0 : 1,
      prioridade: pesoDaPrioridade(l.lead.priority),
      horario: pendentesHoje[0]?.dueAt ?? "9999",
    };
  };
  return [...linhas].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    return (
      ka.resolvido - kb.resolvido ||
      ka.sla - kb.sla ||
      ka.prioridade - kb.prioridade ||
      ka.horario.localeCompare(kb.horario) ||
      a.lead.leadName.localeCompare(b.lead.leadName)
    );
  });
}

/**
 * O início de trilha que faz o passo `dia` cair hoje.
 *
 * Retomar não é reiniciar. Reiniciar ancora o Dia 1 em hoje, e um lead que
 * parou no Dia 4 só voltaria a ter toque daqui a três dias. Retomar desloca a
 * âncora para trás o bastante para o passo onde ele parou cair hoje, e o resto
 * da trilha segue o espaçamento original a partir dali.
 *
 * "Hoje" é o de Brasília. A âncora fica ao meio-dia UTC porque a trilha lê a
 * data UTC do início, e ao meio-dia ela é a mesma em Brasília.
 */
export function inicioParaRetomar(dia: number, agora: Date): string {
  const hojeEmBrasilia = new Date(agora.getTime() + BRASILIA_MS).toISOString().slice(0, 10);
  const ancora = Date.parse(`${hojeEmBrasilia}T12:00:00.000Z`) - (dia - 1) * DIA_MS;
  return new Date(ancora).toISOString();
}

/**
 * Troca os marcadores do roteiro pelo que já se sabe do lead.
 *
 * O roteiro vem do playbook com [Nome], [Empresa] e [SDR]. Copiado cru, a SDR
 * cola no WhatsApp e ainda tem de editar — ou esquece e manda "Olá [Nome]!".
 * Marcador sem valor conhecido fica como está, para continuar visível.
 */
export function preencherRoteiro(
  roteiro: string,
  valores: { nome?: string | null; empresa?: string | null; sdr?: string | null },
): string {
  const primeiro = (v?: string | null) => v?.trim().split(/\s+/)[0] || null;
  const trocas: Record<string, string | null> = {
    "[Nome]": primeiro(valores.nome),
    "[Empresa]": valores.empresa?.trim() || null,
    "[SDR]": primeiro(valores.sdr),
  };
  return roteiro.replace(/\[(Nome|Empresa|SDR)\]/g, (m) => trocas[m] ?? m);
}
