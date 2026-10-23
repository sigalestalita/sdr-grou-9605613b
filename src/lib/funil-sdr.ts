/*
 * Painel dos funis do SDR, a partir do espelho do RD (rd_deals).
 *
 * As contas seguem as do relatório "Negociações concluídas" do RD, para os
 * números baterem quando as SDRs compararem:
 *   - criadas: negócios criados no período;
 *   - vendidas e perdidas: fechados no período, mesmo os criados antes dele;
 *   - em andamento: dos criados no período, os que seguem abertos.
 */

export type NegocioDoFunil = {
  rd_id: string;
  name: string | null;
  pipeline: string | null;
  stage: string | null;
  status: string | null;
  owner_name: string | null;
  rd_created_at: string | null;
  closed_at: string | null;
};

export type LinhaDoDono = {
  dono: string;
  ehSdr: boolean;
  criadas: number;
  emAndamento: number;
  vendidas: number;
  perdidas: number;
  porEtapa: Record<string, number>;
};

// Ordem das etapas do funil do SDR no RD; etapa nova entra no fim.
const ORDEM_DAS_ETAPAS = ["Novo", "Tentativa", "Conectado", "Qualificado", "No-show", "Perda"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A dona é SDR do rodízio? Compara pelo primeiro nome, que é como o RD mostra. */
export function ehDoRodizio(dono: string | null, sdrs: string[]) {
  const primeiro = semAcento((dono ?? "").trim().split(/\s+/)[0] ?? "");
  return !!primeiro && sdrs.some((s) => semAcento(s.split(/\s+/)[0] ?? "") === primeiro);
}

export function montarPainel(
  criadas: NegocioDoFunil[],
  fechadas: NegocioDoFunil[],
  sdrs: string[],
) {
  const porDono = new Map<string, LinhaDoDono>();
  const linha = (dono: string | null) => {
    const nome = dono?.trim() || "Sem responsável";
    let l = porDono.get(nome);
    if (!l) {
      l = {
        dono: nome,
        ehSdr: ehDoRodizio(nome, sdrs),
        criadas: 0,
        emAndamento: 0,
        vendidas: 0,
        perdidas: 0,
        porEtapa: {},
      };
      porDono.set(nome, l);
    }
    return l;
  };

  const etapas = new Set<string>();
  for (const n of criadas) {
    const l = linha(n.owner_name);
    l.criadas++;
    if (n.status === "open") l.emAndamento++;
    const etapa = n.stage || "—";
    etapas.add(etapa);
    l.porEtapa[etapa] = (l.porEtapa[etapa] ?? 0) + 1;
  }
  for (const n of fechadas) {
    const l = linha(n.owner_name);
    if (n.status === "won") l.vendidas++;
    if (n.status === "lost") l.perdidas++;
  }

  const linhas = [...porDono.values()].sort(
    (a, b) => Number(b.ehSdr) - Number(a.ehSdr) || b.criadas - a.criadas,
  );
  const ordem = (e: string) => {
    const i = ORDEM_DAS_ETAPAS.indexOf(e);
    return i === -1 ? ORDEM_DAS_ETAPAS.length : i;
  };
  const soma = (k: "criadas" | "emAndamento" | "vendidas" | "perdidas") =>
    linhas.reduce((t, l) => t + l[k], 0);

  return {
    totais: {
      criadas: soma("criadas"),
      emAndamento: soma("emAndamento"),
      vendidas: soma("vendidas"),
      perdidas: soma("perdidas"),
    },
    linhas,
    etapas: [...etapas].sort((a, b) => ordem(a) - ordem(b) || a.localeCompare(b)),
    /*
     * Criados no período, ainda abertos e no nome de quem não é do rodízio:
     * é o que some do relatório quando a SDR filtra por ela mesma.
     */
    foraDoRodizio: criadas
      .filter((n) => n.status === "open" && !ehDoRodizio(n.owner_name, sdrs))
      .sort((a, b) => (b.rd_created_at ?? "").localeCompare(a.rd_created_at ?? "")),
  };
}
