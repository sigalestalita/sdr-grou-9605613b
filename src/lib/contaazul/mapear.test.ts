import { describe, expect, it } from "vitest";
import {
  horaSP,
  itensDaResposta,
  janelas,
  notaDaApi,
  receberDaApi,
  resumirNotas,
  vendaDaApi,
  vendaDoNegocio,
} from "./mapear";

describe("Conta Azul → Compass", () => {
  it("lê venda, nota e conta a receber no formato da API", () => {
    expect(
      vendaDaApi({
        id: "v1",
        numero: 123,
        situacao: { nome: "Aprovado" },
        cliente: { id: "c1", nome: "ACME" },
        total: 4858,
        data: "2026-11-20",
      }),
    ).toMatchObject({ id: "v1", numero: 123, situacao: "APROVADO", cliente_id: "c1", total: 4858 });
    expect(
      notaDaApi({
        id: "n1",
        id_venda: "v1",
        numero_nfse: "77",
        status: "EMITIDA",
        documento_cliente: "12.345.678/0001-90",
        valor_total_nfse: 2429,
        data_competencia: "2026-11-21",
      }),
    ).toMatchObject({ documento_cliente: "12345678000190", valor: 2429, status: "EMITIDA" });
    expect(
      receberDaApi({
        id: "r1",
        status: "OVERDUE",
        status_traduzido: "ATRASADO",
        total: 100,
        nao_pago: 100,
        data_vencimento: "2026-11-10",
        cliente: { id: "c1" },
      }),
    ).toMatchObject({ status: "ATRASADO", nao_pago: 100, cliente_id: "c1" });
    expect(itensDaResposta({ itens: [{ id: 1 }] })).toHaveLength(1);
    expect(itensDaResposta(null)).toEqual([]);
  });

  it("resume as notas da venda: vendido x faturado", () => {
    const n = (status: string, valor: number, numero = "1") =>
      notaDaApi({
        id: `${status}${valor}${numero}`,
        status,
        valor_total_nfse: valor,
        numero_nfse: numero,
      })!;
    expect(resumirNotas([n("EMITIDA", 2429, "10")], 4858)).toMatchObject({
      status: "PARCIAL",
      valorFaturado: 2429,
      numeros: ["10"],
    });
    expect(resumirNotas([n("EMITIDA", 2429, "10"), n("EMITIDA", 2429, "11")], 4858).status).toBe(
      "EMITIDA",
    );
    expect(resumirNotas([n("FALHA", 4858)], 4858).status).toBe("FALHA");
    expect(resumirNotas([n("EMITINDO", 4858)], 4858).status).toBe("EM_EMISSAO");
    expect(resumirNotas([], 4858).status).toBe("SEM_NOTA");
  });

  it("quebra o período em janelas de 15 dias", () => {
    expect(janelas("2026-11-01", "2026-11-30")).toEqual([
      ["2026-11-01", "2026-11-15"],
      ["2026-11-16", "2026-11-30"],
    ]);
  });

  it("formata a hora de Brasília sem fuso", () => {
    expect(horaSP(new Date("2026-11-23T13:00:00Z"))).toBe("2026-11-23T10:00:00");
  });

  it("liga o negócio à venda só quando há uma candidata clara", () => {
    const v = (id: string, total: number, company_id = "e1") => ({
      ...vendaDaApi({ id, total, situacao: { nome: "APROVADO" } })!,
      company_id,
    });
    const neg = { company_id: "e1", amount: 4858 };
    expect(vendaDoNegocio(neg, [v("a", 4858), v("b", 9000)], new Set())).toBe("a");
    expect(vendaDoNegocio(neg, [v("a", 4858), v("b", 4860)], new Set())).toBeNull();
    expect(vendaDoNegocio(neg, [v("a", 4858)], new Set(["a"]))).toBeNull();
    expect(vendaDoNegocio(neg, [v("a", 4858, "e2")], new Set())).toBeNull();
  });
});
