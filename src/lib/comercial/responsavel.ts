/*
 * Quem responde por um negócio. O executivo da reunião (executivo_user_id) só
 * é preenchido quando o SDR agenda com um executivo; o resto dos negócios
 * (quase todos os que vieram do RD) tem só o dono (owner_user_id). Filtrar
 * "meus negócios" só pelo executivo da reunião deixava a carteira vazia.
 */
export type ComResponsavel = {
  executivo_user_id?: string | null;
  owner_user_id?: string | null;
};

/** O executivo da reunião, ou o dono do negócio quando não há executivo. */
export function responsavelDoNegocio(d: ComResponsavel): string | null {
  return d.executivo_user_id ?? d.owner_user_id ?? null;
}

/** Filtro PostgREST (.or) dos negócios de quem responde por eles. */
export function filtroDoResponsavel(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Usuário inválido");
  return `executivo_user_id.eq.${userId},and(executivo_user_id.is.null,owner_user_id.eq.${userId})`;
}
