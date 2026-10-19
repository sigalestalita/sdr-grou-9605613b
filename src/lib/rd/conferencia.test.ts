import { describe, expect, it } from "vitest";
import { conferir, statusEfetivo, tipoDaAtividadeRd, type CardRd, type NoCrm } from "./conferencia";

const card = (p: Partial<CardRd>): CardRd => ({
  rd_id: "x",
  pipeline: "Vendas",
  stage: "Proposta",
  status: "open",
  owner_name: null,
  amount: 0,
  rd_org_id: null,
  closed_at: null,
  ...p,
});

const vazio = (): NoCrm => ({
  leads: new Set(),
  negocios: new Set(),
  carteiraPorCard: new Set(),
  carteiraPorOrg: new Set(),
  csPorOrg: new Set(),
  ganhosCrm: new Map(),
});

describe("conferir", () => {
  it("conta o que chegou por destino e por etapa", () => {
    const crm = vazio();
    crm.negocios.add("n1");
    crm.leads.add("l1");
    crm.csPorOrg.add("o1");
    const r = conferir(
      [
        card({ rd_id: "n1" }),
        card({ rd_id: "n2", stage: "Diagnóstico" }),
        card({ rd_id: "l1", pipeline: "Leads - Empresa [SDR]" }),
        card({ rd_id: "c1", pipeline: "[CS] Gestão da Carteira", rd_org_id: "o1" }),
        // CS perdido não é esperado no CRM
        card({ rd_id: "c2", pipeline: "[CS] Gestão da Carteira", status: "lost" }),
      ],
      crm,
      () => null,
    );
    const vendas = r.funis.find((f) => f.funil === "Vendas")!;
    expect(vendas).toMatchObject({ destino: "Negócio", total: 2, esperados: 2, noCrm: 1 });
    expect(vendas.etapas.find((e) => e.etapa === "Diagnóstico")).toEqual({
      etapa: "Diagnóstico",
      total: 1,
      noCrm: 0,
    });
    expect(r.funis.find((f) => f.funil === "Leads - Empresa [SDR]")!.noCrm).toBe(1);
    expect(r.funis.find((f) => f.funil === "[CS] Gestão da Carteira")).toMatchObject({
      total: 2,
      esperados: 1,
      noCrm: 1,
    });
  });

  it("compara vendas ganhas por ano, contando 'Venda' aberta como ganha", () => {
    const crm = vazio();
    crm.ganhosCrm.set("2025", { qtd: 1, valor: 100 });
    const r = conferir(
      [
        card({ rd_id: "a", status: "won", amount: 100, closed_at: "2025-03-01" }),
        card({ rd_id: "b", stage: "Venda", amount: 50, closed_at: "2025-05-01" }),
      ],
      crm,
      () => null,
    );
    expect(r.anos).toEqual([{ ano: "2025", rdQtd: 2, rdValor: 150, crmQtd: 1, crmValor: 100 }]);
  });

  it("lista primeiro os donos sem usuário", () => {
    const r = conferir(
      [
        card({ rd_id: "1", owner_name: "Ana Souza" }),
        card({ rd_id: "2", owner_name: "Bruno Lima" }),
        card({ rd_id: "3", owner_name: "Bruno Lima" }),
      ],
      vazio(),
      (n) => (n === "Bruno Lima" ? "u1" : null),
    );
    expect(r.donos.map((d) => d.nome)).toEqual(["Ana Souza", "Bruno Lima"]);
  });
});

describe("statusEfetivo / tipoDaAtividadeRd", () => {
  it("normaliza", () => {
    expect(statusEfetivo({ status: "open", stage: "Venda" })).toBe("won");
    expect(statusEfetivo({ status: "open", stage: "Vendas futuras" })).toBe("open");
    expect(tipoDaAtividadeRd("Call")).toBe("ligacao");
    expect(tipoDaAtividadeRd("meeting")).toBe("reuniao");
    expect(tipoDaAtividadeRd(undefined)).toBe("nota");
  });
});
