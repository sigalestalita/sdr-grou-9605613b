/*
 * A coluna "area" é o que separa a caixa do SDR da caixa do CS na mesma
 * tabela de conversas. Ela nasce na migration
 * 20260917100000_cs_atendimento_e_tickets, que só existe no banco depois de
 * aplicada pelo Lovable.
 *
 * Enquanto isso não acontece, filtrar por ela derruba a consulta inteira com
 * 42703 e a caixa de entrada do SDR fica carregando para sempre. Aqui a gente
 * pergunta uma vez ao banco se a coluna existe e guarda a resposta: sem a
 * coluna, a caixa mostra tudo, que é exatamente como era antes do CS entrar.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

let existe: boolean | null = null;

/** Só para os testes: esquece o que já foi descoberto. */
export function esquecerSeTemArea() {
  existe = null;
}

export async function temColunaArea(db: Cliente): Promise<boolean> {
  if (existe !== null) return existe;
  const { error } = await db.from("whatsapp_conversations").select("area").limit(1);
  existe = !(
    error &&
    (error.code === "42703" || /column .*area.* does not exist/i.test(error.message ?? ""))
  );
  return existe;
}
