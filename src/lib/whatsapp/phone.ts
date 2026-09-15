/*
 * Casar um número recebido com o lead que já existe.
 *
 * O problema é que o mesmo telefone chega escrito de três jeitos:
 *   * do formulário/RD:  "+55 (11) 95667-2656"
 *   * do webhook da Meta: "5511956672656"
 *   * digitado à mão:     "11 95667 2656"
 *
 * Comparar esses textos entre si nunca funciona. E comparar só os dígitos
 * também não basta no Brasil: o wa_id da Meta às vezes vem sem o nono dígito
 * do celular, então 5511956672656 e 551156672656 são a mesma pessoa.
 *
 * A chave normaliza tudo isso: tira o 55, guarda o DDD e os últimos 8 dígitos,
 * que são os que não mudam. O DDD entra junto porque "56672656" sozinho
 * colide entre estados.
 */

/** Só os dígitos, sem zeros à esquerda. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D+/g, "").replace(/^0+/, "");
}

/**
 * Chave estável de comparação: DDD + últimos 8 dígitos.
 *
 * Número de fora do Brasil não tem DDD nem nono dígito, então fica com os
 * próprios dígitos e é comparado inteiro.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;

  // Brasil: 55 + DDD (2) + 8 ou 9 dígitos = 12 ou 13.
  const nacional = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  if (nacional.length >= 10 && nacional.length <= 11) {
    return nacional.slice(0, 2) + nacional.slice(-8);
  }
  // Sem DDD reconhecível (número curto, estrangeiro): compara o que veio.
  return nacional.length > 13 || nacional.length < 10 ? nacional : nacional.slice(-8);
}

/** Dois números são da mesma pessoa? */
export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  return !!ka && !!kb && ka === kb;
}

/**
 * Os últimos 4 dígitos sobrevivem a qualquer formatação — "2656" aparece
 * inteiro em "+55 (11) 95667-2656" e em "5511956672656". Serve de filtro
 * grosso no banco quando a coluna normalizada ainda não existe; quem decide
 * de verdade é o sameNumber, em cima do resultado.
 */
export function ultimos4(raw: string | null | undefined): string {
  return phoneDigits(raw).slice(-4);
}
