import { describe, expect, it } from "vitest";
import {
  agregarStatus,
  clienteDaApi,
  detalheClienteDaApi,
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

  it("junta o status dos CNPJs do rateio", () => {
    expect(agregarStatus(["EMITIDA", "EMITIDA"])).toBe("EMITIDA");
    expect(agregarStatus(["EMITIDA", "SEM_NOTA"])).toBe("PARCIAL");
    expect(agregarStatus(["EMITIDA", "FALHA"])).toBe("FALHA");
    expect(agregarStatus(["EM_EMISSAO", "SEM_NOTA"])).toBe("EM_EMISSAO");
    expect(agregarStatus([])).toBe("SEM_NOTA");
  });
});

describe("cliente da Conta Azul", () => {
  it("lista: observações em observacoes_gerais, endereço em objeto", () => {
    const c = clienteDaApi({
      id: "p1",
      nome: "ACME LTDA",
      documento: "12.345.678/0001-90",
      observacoes_gerais: "  Exige OC no corpo da nota ",
      email: "fin@acme.com",
      telefone: "11 9999",
      ativo: true,
      data_alteracao: "2026-11-20T10:00:00",
      endereco: { cidade: "São Paulo", estado: "SP", cep: "01000-000" },
    });
    expect(c?.documento).toBe("12345678000190");
    expect(c?.observacoes).toBe("Exige OC no corpo da nota");
    expect(c?.endereco?.cidade).toBe("São Paulo");
  });

  it("detalhe: observacao, outros contatos, e-mails de cobrança e inscrição", () => {
    const d = detalheClienteDaApi({
      id: "p1",
      nome: "ACME",
      observacao: "Boleto só dia 10",
      outros_contatos: [
        { nome: "Ana", cargo: "Financeiro", email: "ana@acme.com", telefone_comercial: "11 1" },
        { nome: "", email: "" },
      ],
      contato_cobranca_faturamento: { emails: ["NF@acme.com, nf@acme.com", "x"] },
      inscricoes: [{ inscricao_estadual: "123", inscricao_municipal: "456" }],
      enderecos: [{ cidade: "Curitiba", estado: "PR" }],
    });
    expect(d?.observacoes).toBe("Boleto só dia 10");
    expect(d?.outros_contatos).toEqual([
      { nome: "Ana", cargo: "Financeiro", email: "ana@acme.com", telefone: "11 1" },
    ]);
    expect(d?.emails_cobranca).toEqual(["nf@acme.com"]);
    expect(d?.inscricao_estadual).toBe("123");
    expect(d?.endereco?.cidade).toBe("Curitiba");
  });

  it("sem id não vira cliente", () => {
    expect(clienteDaApi({ nome: "x" })).toBeNull();
  });
});
