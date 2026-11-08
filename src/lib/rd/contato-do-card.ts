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
  nome?: string | null;
  company_id?: string | null;
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
  /** `${company_id}|${nome normalizado}`: card que só traz o nome do contato. */
  porEmpresaNome: Map<string, string>;
};

export const normNome = (n: unknown) =>
  String(n ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim() || null;

const chaveEmpresaNome = (empresa: string | null | undefined, nome: unknown) => {
  const n = normNome(nome);
  return empresa && n ? `${empresa}|${n}` : null;
};

export function indexarContatos(rows: ContatoConhecido[]): IndiceDeContatos {
  const idx: IndiceDeContatos = {
    porRd: new Map(),
    porEmail: new Map(),
    porFone: new Map(),
    porEmpresaNome: new Map(),
  };
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
    const kn = chaveEmpresaNome(c.company_id, c.nome);
    if (kn && !idx.porEmpresaNome.has(kn)) idx.porEmpresaNome.set(kn, c.id);
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

/**
 * Id do contato no Compass, ou null se ele ainda não existe. Sem id, e-mail
 * nem telefone, casa pelo nome dentro da empresa do negócio.
 */
export function acharContato(
  idx: IndiceDeContatos,
  c: ContatoDoCard,
  empresa?: string | null,
): string | null {
  const k = chavesDoCard(c);
  if (k.rd && idx.porRd.has(String(k.rd))) return idx.porRd.get(String(k.rd))!;
  for (const e of k.emails) if (idx.porEmail.has(e)) return idx.porEmail.get(e)!;
  for (const f of k.fones) if (idx.porFone.has(f)) return idx.porFone.get(f)!;
  const kn = chaveEmpresaNome(empresa, c.name);
  if (kn && idx.porEmpresaNome.has(kn)) return idx.porEmpresaNome.get(kn)!;
  return null;
}

/** Chave para não criar duas vezes o mesmo contato novo. */
export function chaveDoNovo(c: ContatoDoCard, empresa?: string | null): string | null {
  const k = chavesDoCard(c);
  return k.emails[0] ?? k.fones[0] ?? chaveEmpresaNome(empresa, c.name);
}

/** Guarda no índice um contato recém-criado, para o próximo card achá-lo. */
export function lembrarContato(
  idx: IndiceDeContatos,
  id: string,
  c: ContatoDoCard,
  empresa?: string | null,
) {
  const k = chavesDoCard(c);
  const kn = chaveEmpresaNome(empresa, c.name);
  if (kn && !idx.porEmpresaNome.has(kn)) idx.porEmpresaNome.set(kn, id);
  if (k.rd) idx.porRd.set(String(k.rd), id);
  for (const e of k.emails) if (!idx.porEmail.has(e)) idx.porEmail.set(e, id);
  for (const f of k.fones) if (!idx.porFone.has(f)) idx.porFone.set(f, id);
}
