/*
 * O que a IA precisa perguntar antes de diagnosticar.
 *
 * Lead que chega por clique no anúncio vem só com telefone e, com sorte, um
 * nome. A IA descobria o tipo e já emendava nas perguntas de diagnóstico —
 * "qual o principal resultado que sua empresa busca?" — e o card ficava vazio:
 * sem empresa, sem cargo, sem porte, sem e-mail. A SDR recebia uma conversa
 * rica e um cadastro em branco.
 *
 * A ordem das perguntas mora aqui, em código, e não no prompt. Pedir ao modelo
 * para seguir um roteiro não segurou nas outras vezes; dizer a ele qual é a
 * próxima pergunta, uma por vez, segura.
 */

export type CampoDeCadastro = "lead_type" | "company_name" | "position" | "company_size" | "email";

export type LeadParaCadastro = {
  lead_type?: string | null;
  company_name?: string | null;
  position?: string | null;
  company_size?: string | null;
  email?: string | null;
};

type Definicao = {
  campo: CampoDeCadastro;
  rotulo: string;
  /** O que a IA deve perguntar, em uma linha. */
  pergunta: string;
};

/*
 * A ordem importa: tipo primeiro, porque ele decide a trilha e a dona do lead.
 * Depois o que é fácil de responder, e o e-mail por último — é o que mais
 * parece formulário e o que mais espanta quem acabou de chegar.
 */
export const ROTEIRO: Definicao[] = [
  {
    campo: "lead_type",
    rotulo: "tipo de lead",
    pergunta:
      "se a pessoa quer usar na própria empresa ou atender outras empresas como consultoria",
  },
  {
    campo: "company_name",
    rotulo: "empresa",
    pergunta: "o nome da empresa ou da consultoria dela",
  },
  { campo: "position", rotulo: "cargo", pergunta: "qual o cargo dela" },
  {
    campo: "company_size",
    rotulo: "porte",
    pergunta: "quantas pessoas trabalham na empresa hoje",
  },
  {
    campo: "email",
    rotulo: "e-mail",
    pergunta: "o melhor e-mail para enviar o material e o convite da conversa",
  },
];

function vazio(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** O que ainda falta, na ordem em que deve ser perguntado. */
export function camposQueFaltam(lead: LeadParaCadastro): Definicao[] {
  return ROTEIRO.filter((d) => vazio(lead[d.campo]));
}

export function cadastroCompleto(lead: LeadParaCadastro): boolean {
  return camposQueFaltam(lead).length === 0;
}

/**
 * A instrução que entra no prompt.
 *
 * Uma pergunta por mensagem: duas de uma vez viram formulário e a pessoa
 * responde só a última. Com o cadastro fechado, a instrução some e a IA volta
 * a conduzir a conversa normalmente.
 */
export function instrucaoDeCadastro(lead: LeadParaCadastro): string {
  const faltam = camposQueFaltam(lead);
  if (faltam.length === 0) return "";
  const proximo = faltam[0];
  const restantes = faltam.slice(1).map((d) => d.rotulo);
  return [
    "CADASTRO ANTES DO DIAGNÓSTICO.",
    `Ainda falta saber ${faltam.map((d) => d.rotulo).join(", ")}.`,
    `Nesta mensagem, pergunte ${proximo.pergunta}.`,
    "Faça uma pergunta só, encaixada na conversa, sem parecer formulário.",
    "Não faça pergunta de diagnóstico (desafio, objetivo, impacto, resultado) enquanto esses dados não estiverem completos.",
    restantes.length
      ? `Depois que ela responder, o próximo dado a perguntar é ${restantes[0]}.`
      : "Depois que ela responder, o cadastro fecha e a conversa pode seguir para o diagnóstico.",
  ].join(" ");
}
