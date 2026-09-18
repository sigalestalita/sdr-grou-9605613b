/*
 * Quem está falando com o lead agora: a IA ou uma pessoa.
 *
 * O estado estava espalhado e era ambíguo. "open" significava tanto "a IA está
 * atendendo" quanto "uma SDR assumiu e está tocando", porque assumir devolve a
 * conversa para aberta. Sem um nome para cada situação, ninguém enxergava na
 * tela de quem é a bola — e, pior, a IA continuava respondendo depois de o
 * bastão ter sido passado.
 */

export type QuemAtende = "ia" | "aguardando_humano" | "humano" | "encerrada";

export type EstadoDaConversa = {
  status: string | null | undefined;
  /** Preenchido quando alguém clicou em assumir ou respondeu pela conversa. */
  assumedAt?: string | null;
  /** Alguma mensagem escrita por gente, mesmo sem ter clicado em assumir. */
  temMensagemHumana?: boolean;
};

export function quemAtende(e: EstadoDaConversa): QuemAtende {
  if (e.status === "closed") return "encerrada";
  if (e.assumedAt || e.temMensagemHumana) return "humano";
  if (e.status === "pending") return "aguardando_humano";
  return "ia";
}

/**
 * A IA só fala enquanto a bola é dela.
 *
 * Esta é a trava que faltava: passar o bastão mudava o status e o responsável,
 * mas nada impedia a próxima mensagem do lead de acordar a IA de novo.
 */
export function iaPodeResponder(e: EstadoDaConversa): boolean {
  return quemAtende(e) === "ia";
}

export const ROTULO_DE_QUEM_ATENDE: Record<QuemAtende, string> = {
  ia: "IA atendendo",
  aguardando_humano: "Aguardando SDR",
  humano: "Com a SDR",
  encerrada: "Encerrada",
};

export const EXPLICACAO_DE_QUEM_ATENDE: Record<QuemAtende, string> = {
  ia: "A IA está conduzindo a conversa e qualificando o lead.",
  aguardando_humano: "O bastão foi passado e ninguém assumiu ainda. A IA não responde mais aqui.",
  humano: "Uma pessoa assumiu a conversa. A IA não responde mais aqui.",
  encerrada: "Conversa encerrada.",
};

/** Classes de cor por estado, para o selo ficar igual no kanban e no chat. */
export const COR_DE_QUEM_ATENDE: Record<QuemAtende, string> = {
  ia: "border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  aguardando_humano: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  humano: "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  encerrada: "border-border bg-muted text-muted-foreground",
};

const HUMANOS = new Set(["sdr", "agent", "human"]);

export function temMensagemDeHumano(mensagens: Array<{ sender_type: string }>): boolean {
  return mensagens.some((m) => HUMANOS.has(m.sender_type));
}
