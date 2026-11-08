/*
 * Contatos de um card do RD — parte pura, sem banco.
 *
 * A listagem de negócios do RD traz os contatos do card só com nome, e-mails
 * e telefones, sem o id do contato. Casar pelo id deixava todo negócio sem
 * contato (deal_contacts quase vazio). Aqui o casamento é pelo id quando vem,
 * senão pelo e-mail, senão pelo telefone.
 */

export type ContatoDoCard = {
  _id?: string;
  id?: string;
  name?: string | null;
  title?: string | null;
  emails?: Array<{ email?: string | null }> | null;
  phones?: Array<{ phone?: string | null }> | null;
};

export type ContatoConhecido = {
  id: string;
  rd_contact_id?: string | null;
  email?: string | null;
  emails?: string[] | null;
  telefone?: string | null;
  phones?: string[] | null;
};

export const normEmail = (e: unknown) => {
  const s = String(e ?? "")
    .trim()
    .toLowerCase();
  return s.includes("@") ? s : null;
};

/** Últimos 10/11 dígitos do telefone (sem DDI 55), para casar formatos diferentes. */
export function normFone(f: unknown): string | null {
  let d = String(f ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  return d.length >= 10 ? d : null;
}

export type IndiceDeContatos = {
  porRd: Map<string, string>;
  porEmail: Map<string, string>;
  porFone: Map<string, string>;
};

export function indexarContatos(rows: ContatoConhecido[]): IndiceDeContatos {
  const idx: IndiceDeContatos = { porRd: new Map(), porEmail: new Map(), porFone: new Map() };
  for (const c of rows) {
    if (c.rd_contact_id) idx.porRd.set(String(c.rd_contact_id), c.id);
    for (const e of [c.email, ...(c.emails ?? [])]) {
      const k = normEmail(e);
      if (k && !idx.porEmail.has(k)) idx.porEmail.set(k, c.id);
    }
    for (const f of [c.telefone, ...(c.phones ?? [])]) {
      const k = normFone(f);
      if (k && !idx.porFone.has(k)) idx.porFone.set(k, c.id);
    }
  }
  return idx;
}

export function chavesDoCard(c: ContatoDoCard) {
  return {
    rd: c._id ?? c.id ?? null,
    emails: (c.emails ?? []).map((e) => normEmail(e?.email)).filter((e): e is string => !!e),
    fones: (c.phones ?? []).map((p) => normFone(p?.phone)).filter((f): f is string => !!f),
  };
}

/** Id do contato no Compass, ou null se ele ainda não existe. */
export function acharContato(idx: IndiceDeContatos, c: ContatoDoCard): string | null {
  const k = chavesDoCard(c);
  if (k.rd && idx.porRd.has(String(k.rd))) return idx.porRd.get(String(k.rd))!;
  for (const e of k.emails) if (idx.porEmail.has(e)) return idx.porEmail.get(e)!;
  for (const f of k.fones) if (idx.porFone.has(f)) return idx.porFone.get(f)!;
  return null;
}

/** Guarda no índice um contato recém-criado, para o próximo card achá-lo. */
export function lembrarContato(idx: IndiceDeContatos, id: string, c: ContatoDoCard) {
  const k = chavesDoCard(c);
  if (k.rd) idx.porRd.set(String(k.rd), id);
  for (const e of k.emails) if (!idx.porEmail.has(e)) idx.porEmail.set(e, id);
  for (const f of k.fones) if (!idx.porFone.has(f)) idx.porFone.set(f, id);
}
