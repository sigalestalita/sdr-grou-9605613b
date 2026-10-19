/*
 * Conferência da migração: o que existe no RD (espelho rd_deals) contra o que
 * chegou ao CRM. Lógica pura, para testar sem banco.
 *
 * Cada card do RD tem um destino pelo funil (funis.ts) e "chegou" quando:
 *   lead      → existe lead com aquele rd_deal_id
 *   negócio   → existe negócio com aquele rd_deal_id
 *   conta     → a empresa está na carteira comercial (company_funis)
 *   cs        → a empresa tem ficha no CS (só cards abertos contam)
 */
import { destinoDoFunilRd, type DestinoRd } from "./funis";

export type CardRd = {
  rd_id: string;
  pipeline: string | null;
  stage: string | null;
  status: string | null;
  owner_name: string | null;
  amount: number | null;
  rd_org_id: string | null;
  closed_at: string | null;
};

export type NoCrm = {
  leads: Set<string>;
  negocios: Set<string>;
  /** rd_deal_id dos cards de carteira e rd_org_id das empresas na carteira */
  carteiraPorCard: Set<string>;
  carteiraPorOrg: Set<string>;
  /** rd_org_id das empresas com ficha no CS */
  csPorOrg: Set<string>;
  /** negócios ganhos importados: ano → { qtd, valor } */
  ganhosCrm: Map<string, { qtd: number; valor: number }>;
};

export type LinhaEtapa = { etapa: string; total: number; noCrm: number };
export type LinhaFunil = {
  funil: string;
  destino: string;
  total: number;
  abertos: number;
  ganhos: number;
  perdidos: number;
  /** cards que deveriam estar no CRM (no CS, só os abertos) */
  esperados: number;
  noCrm: number;
  etapas: LinhaEtapa[];
};
export type LinhaDono = { nome: string; cards: number; usuario: string | null };
export type LinhaAno = {
  ano: string;
  rdQtd: number;
  rdValor: number;
  crmQtd: number;
  crmValor: number;
};

export const DESTINO_LABEL: Record<DestinoRd["tipo"], string> = {
  lead: "Lead do SDR",
  negocio: "Negócio",
  conta: "Carteira comercial",
  cs: "Carteira do CS",
};

/** O RD deixou ~10 mil vendas "abertas" na etapa Venda; a transformação as trata como ganhas. */
export function statusEfetivo(c: Pick<CardRd, "status" | "stage">): "open" | "won" | "lost" {
  const s = (c.status ?? "open") as "open" | "won" | "lost";
  if (s === "open" && /^\s*venda\s*$/i.test(c.stage ?? "")) return "won";
  return s;
}

export function conferir(
  cards: CardRd[],
  crm: NoCrm,
  usuarioDe: (nome: string) => string | null,
): { funis: LinhaFunil[]; donos: LinhaDono[]; anos: LinhaAno[] } {
  const funis = new Map<string, LinhaFunil & { porEtapa: Map<string, LinhaEtapa> }>();
  const donos = new Map<string, number>();
  const anos = new Map<string, LinhaAno>();

  for (const c of cards) {
    const nomeFunil = (c.pipeline ?? "").trim() || "(sem funil)";
    const destino = destinoDoFunilRd(c.pipeline);
    const status = statusEfetivo(c);
    let f = funis.get(nomeFunil);
    if (!f) {
      f = {
        funil: nomeFunil,
        destino: DESTINO_LABEL[destino.tipo],
        total: 0,
        abertos: 0,
        ganhos: 0,
        perdidos: 0,
        esperados: 0,
        noCrm: 0,
        etapas: [],
        porEtapa: new Map(),
      };
      funis.set(nomeFunil, f);
    }
    f.total++;
    if (status === "open") f.abertos++;
    else if (status === "won") f.ganhos++;
    else f.perdidos++;

    const esperado = destino.tipo !== "cs" || status === "open";
    const chegou =
      destino.tipo === "lead"
        ? crm.leads.has(c.rd_id)
        : destino.tipo === "negocio"
          ? crm.negocios.has(c.rd_id)
          : destino.tipo === "conta"
            ? crm.carteiraPorCard.has(c.rd_id) ||
              (!!c.rd_org_id && crm.carteiraPorOrg.has(c.rd_org_id))
            : !!c.rd_org_id && crm.csPorOrg.has(c.rd_org_id);
    if (esperado) {
      f.esperados++;
      if (chegou) f.noCrm++;
      const nomeEtapa = (c.stage ?? "").trim() || "(sem etapa)";
      const e = f.porEtapa.get(nomeEtapa) ?? { etapa: nomeEtapa, total: 0, noCrm: 0 };
      e.total++;
      if (chegou) e.noCrm++;
      f.porEtapa.set(nomeEtapa, e);
    }

    const dono = (c.owner_name ?? "").trim();
    if (dono) donos.set(dono, (donos.get(dono) ?? 0) + 1);

    if (destino.tipo === "negocio" && status === "won") {
      const ano = (c.closed_at ?? "").slice(0, 4) || "sem data";
      const a = anos.get(ano) ?? { ano, rdQtd: 0, rdValor: 0, crmQtd: 0, crmValor: 0 };
      a.rdQtd++;
      a.rdValor += Number(c.amount ?? 0) || 0;
      anos.set(ano, a);
    }
  }

  for (const [ano, g] of crm.ganhosCrm) {
    const a = anos.get(ano) ?? { ano, rdQtd: 0, rdValor: 0, crmQtd: 0, crmValor: 0 };
    a.crmQtd = g.qtd;
    a.crmValor = g.valor;
    anos.set(ano, a);
  }

  return {
    funis: [...funis.values()]
      .map(({ porEtapa, ...f }) => ({
        ...f,
        etapas: [...porEtapa.values()].sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total),
    donos: [...donos.entries()]
      .map(([nome, n]) => ({ nome, cards: n, usuario: usuarioDe(nome) }))
      .sort((a, b) => Number(!!a.usuario) - Number(!!b.usuario) || b.cards - a.cards),
    anos: [...anos.values()].sort((a, b) => b.ano.localeCompare(a.ano)),
  };
}

/** Tipo da atividade do RD → tipo de deal_activities. */
export function tipoDaAtividadeRd(kind: string | null | undefined): string {
  const k = (kind ?? "").toLowerCase();
  if (/call|liga|telefon/.test(k)) return "ligacao";
  if (/mail/.test(k)) return "email";
  if (/meet|reuni|visit/.test(k)) return "reuniao";
  if (/whats/.test(k)) return "whatsapp";
  if (/propos/.test(k)) return "proposta";
  return "nota";
}
