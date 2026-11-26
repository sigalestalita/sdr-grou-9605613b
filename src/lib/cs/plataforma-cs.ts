/*
 * Uso da Plataforma de CS — parte pura: como ligar cada usuário da plataforma
 * a uma empresa do Compass e o que conta como "usou".
 *
 * A plataforma não sabe de que empresa é cada pessoa; o e-mail de login é a
 * ponte. Primeiro o e-mail exato de um contato do cliente; sem ele, o domínio
 * corporativo, quando só uma empresa tem contato com aquele domínio. E-mail
 * pessoal (gmail, hotmail…) só liga pelo e-mail exato.
 */
export const DIAS_USO = 90;

const DOMINIOS_PESSOAIS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "globomail.com",
  "r7.com",
  "zipmail.com.br",
  "proton.me",
  "protonmail.com",
  // a própria Grou: quem é do time não é cliente
  "grougp.com.br",
  "grougp.com",
]);

export const normalizarEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export function dominioCorporativo(email: string): string | null {
  const d = normalizarEmail(email).split("@")[1];
  if (!d || DOMINIOS_PESSOAIS.has(d)) return null;
  return d;
}

export type ContatoDoCompass = { clientUid: string; email: string | null };

/** Índices de ligação: e-mail exato → empresas; domínio de uma empresa só → empresa. */
export function montarIndices(contatos: ContatoDoCompass[]) {
  const porEmail = new Map<string, Set<string>>();
  const empresasPorDominio = new Map<string, Set<string>>();
  for (const c of contatos) {
    const e = normalizarEmail(c.email);
    if (!e.includes("@")) continue;
    if (!porEmail.has(e)) porEmail.set(e, new Set());
    porEmail.get(e)!.add(c.clientUid);
    const d = dominioCorporativo(e);
    if (d) {
      if (!empresasPorDominio.has(d)) empresasPorDominio.set(d, new Set());
      empresasPorDominio.get(d)!.add(c.clientUid);
    }
  }
  const porDominio = new Map<string, string>();
  for (const [d, set] of empresasPorDominio) if (set.size === 1) porDominio.set(d, [...set][0]);
  return { porEmail, porDominio };
}

export function ligarUsuario(
  email: string,
  idx: ReturnType<typeof montarIndices>,
): Array<{ clientUid: string; ligadoPor: "email" | "dominio" }> {
  const e = normalizarEmail(email);
  const exatos = idx.porEmail.get(e);
  if (exatos?.size) return [...exatos].map((clientUid) => ({ clientUid, ligadoPor: "email" }));
  const d = dominioCorporativo(e);
  const pelaEmpresa = d ? idx.porDominio.get(d) : undefined;
  return pelaEmpresa ? [{ clientUid: pelaEmpresa, ligadoPor: "dominio" }] : [];
}

/** Usou a plataforma nos últimos 90 dias: entrou ou concluiu aula ou módulo. */
export function usouNoPeriodo(
  u: { ultimaAtividade: string | null },
  agora: Date = new Date(),
): boolean {
  if (!u.ultimaAtividade) return false;
  return agora.getTime() - new Date(u.ultimaAtividade).getTime() <= DIAS_USO * 86400000;
}

/** A mais recente entre o último login e a última conclusão. */
export function maisRecente(...datas: Array<string | null | undefined>): string | null {
  let melhor: string | null = null;
  for (const d of datas) {
    if (!d) continue;
    if (!melhor || new Date(d).getTime() > new Date(melhor).getTime()) melhor = d;
  }
  return melhor;
}
