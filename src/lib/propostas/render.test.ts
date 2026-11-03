import { describe, expect, it } from "vitest";
import {
  blocos,
  juntarSecoes,
  modelosDosItens,
  montarConteudo,
  trechos,
  trocarVariaveis,
  variaveisDesconhecidas,
  type ModeloTexto,
} from "./render";
import { descontoItem, totalItem } from "@/lib/catalogo/itens";

const licenca: ModeloTexto = {
  id: "m1",
  nome: "Licença PDA",
  versao: 2,
  cor: "#f08a24",
  titulo: "Proposta Comercial",
  introducao: "A/C: {{contato.nome}} | {{empresa.nome}}",
  condicoes: "Forma de pagamento: {{pagamento}}\nValidade da proposta: {{validade}}",
  secoes: [
    { titulo: "Objeto e Recursos", corpo: "Licença do PDA." },
    {
      titulo: "Termos de compra",
      corpo: "- Reajuste IPCA\n- Impostos retidos\n- Rescisão sem devolução",
    },
  ],
  rodape: "DADOS GROU\nCódigo NFS-e: 1.05",
  codigo_nfse: "1.05",
};
const capacitacao: ModeloTexto = {
  ...licenca,
  id: "m2",
  nome: "Capacitação PDA",
  versao: 1,
  secoes: [
    { titulo: "Objeto e Recursos", corpo: "Certificação PDA, 9 horas." },
    { titulo: "Termos de compra", corpo: "- Reajuste IPCA\n- Impostos retidos\n- Multa de 25%" },
  ],
  rodape: "DADOS GROU\nCódigo NFS-e: 1.07",
  codigo_nfse: "1.07",
};

describe("desconto do item", () => {
  it("em % e em R$, nunca maior que o bruto", () => {
    expect(
      descontoItem({ quantidade: 2, valor_unitario: 100, desconto_tipo: "pct", desconto: 10 }),
    ).toBe(20);
    expect(
      descontoItem({ quantidade: 1, valor_unitario: 100, desconto_tipo: "valor", desconto: 30 }),
    ).toBe(30);
    expect(
      descontoItem({ quantidade: 1, valor_unitario: 100, desconto_tipo: "valor", desconto: 500 }),
    ).toBe(100);
    expect(
      descontoItem({ quantidade: 1, valor_unitario: 100, desconto_tipo: "pct", desconto: 150 }),
    ).toBe(100);
    expect(totalItem({ quantidade: 3, valor_unitario: 10 })).toBe(30);
  });
});

describe("variáveis", () => {
  it("troca as conhecidas e deixa as desconhecidas à vista", () => {
    expect(trocarVariaveis("Oi {{contato.nome}}, {{xpto}}", { "contato.nome": "Ana" })).toBe(
      "Oi Ana, {{xpto}}",
    );
    expect(variaveisDesconhecidas("{{empresa.nome}} {{empresa.nomee}}")).toEqual(["empresa.nomee"]);
  });
});

describe("montarConteudo", () => {
  const dados = {
    hoje: "2026-11-03",
    validadeDias: 10,
    pagamento: "Em até 2x sem juros",
    observacoes: "",
    impostos: 100,
    negocio: "Acme 2026",
    cliente: { empresa: "Acme", contato: "Ana", cargo: "RH", cnpj: null },
    executivo: { nome: "Talita", email: "t@grou" },
    itens: [
      {
        nome: "Licença PDA 15",
        quantidade: 1,
        valor_unitario: 3100,
        desconto_tipo: "pct" as const,
        desconto: 10,
        recorrencia: "unico" as const,
      },
      { nome: "Certificação PDA", quantidade: 1, valor_unitario: 1758 },
    ],
  };

  it("congela valores, variáveis e totais", () => {
    const c = montarConteudo([licenca], dados);
    expect(c.introducao).toBe("A/C: Ana | Acme");
    expect(c.condicoes).toContain("Em até 2x sem juros");
    expect(c.condicoes).toContain("13/11/2026 (10 dias)");
    expect(c.validadeAte).toBe("2026-11-13");
    expect(c.itens[0]).toMatchObject({ desconto: 310, desconto_rotulo: "10%", subtotal: 2790 });
    expect(c.totais).toEqual({
      bruto: 4858,
      desconto: 310,
      total: 4548,
      impostos: 100,
      final: 4448,
    });
  });

  it("junta dois modelos sem repetir cláusula", () => {
    const c = montarConteudo([licenca, capacitacao], dados);
    expect(c.secoes.map((s) => s.titulo)).toEqual(["Objeto e Recursos", "Termos de compra"]);
    const termos = c.secoes[1].corpo;
    expect(termos.match(/Reajuste IPCA/g)).toHaveLength(1);
    expect(termos).toContain("Rescisão sem devolução");
    expect(termos).toContain("Multa de 25%");
    expect(c.rodape).toContain("1.05");
    expect(c.rodape).toContain("1.07");
    expect(c.rodape.match(/DADOS GROU/g)).toHaveLength(1);
    expect(c.codigosNfse).toEqual(["1.05", "1.07"]);
  });

  it("modelo dos itens, ou o padrão", () => {
    expect(modelosDosItens(["a", null, "b", "a"], "p")).toEqual(["a", "b"]);
    expect(modelosDosItens([null], "p")).toEqual(["p"]);
    expect(
      juntarSecoes([[{ titulo: "A", corpo: "x" }], [{ titulo: "a", corpo: "y" }]]),
    ).toHaveLength(1);
  });
});

describe("markdown simples", () => {
  it("títulos, listas e parágrafos", () => {
    const b = blocos("## Termos\n- um\n  continua\n- dois\n\nTexto **forte** em https://x.com/a");
    expect(b[0]).toEqual({ t: "h", texto: "Termos" });
    expect(b[1]).toEqual({ t: "ul", itens: ["um\ncontinua", "dois"] });
    expect(b[2].t).toBe("p");
    expect(trechos("Texto **forte** em https://x.com/a")).toEqual([
      { t: "txt", v: "Texto " },
      { t: "b", v: "forte" },
      { t: "txt", v: " em " },
      { t: "link", v: "https://x.com/a" },
    ]);
  });
});
