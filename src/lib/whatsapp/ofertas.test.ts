import { describe, expect, it } from "vitest";
import {
  blocoDeOfertas,
  ofertasDoPublico,
  ofertasVencidas,
  ofertasVigentes,
  pareceConterPreco,
  type Oferta,
} from "./ofertas";

const HOJE = new Date(2026, 8, 13); // 13/09/2026

const bronze: Oferta = {
  titulo: "Licença Bronze com 5 créditos",
  detalhe: "R$ 375 em vez de R$ 660",
  validoAte: "2026-08-31",
};
const vigente: Oferta = {
  titulo: "Consultoria: primeira licença",
  detalhe: "Condição de entrada para consultores",
  validoAte: "2026-09-30",
};
const semPrazo: Oferta = { titulo: "Plano anual", detalhe: "12 meses", validoAte: null };

describe("ofertasVigentes", () => {
  it("tira do ar a campanha que venceu", () => {
    expect(ofertasVigentes([bronze, vigente], HOJE).map((o) => o.titulo)).toEqual([vigente.titulo]);
  });

  it("mantém oferta sem data de fim", () => {
    expect(ofertasVigentes([semPrazo], HOJE)).toHaveLength(1);
  });

  it("o último dia ainda vale", () => {
    expect(ofertasVigentes([{ ...vigente, validoAte: "2026-09-13" }], HOJE)).toHaveLength(1);
    expect(ofertasVigentes([{ ...vigente, validoAte: "2026-09-12" }], HOJE)).toHaveLength(0);
  });

  it("ignora item sem título", () => {
    expect(ofertasVigentes([{ titulo: "  ", detalhe: "x", validoAte: null }], HOJE)).toHaveLength(
      0,
    );
  });

  it("lista as vencidas para a tela avisar", () => {
    expect(ofertasVencidas([bronze, vigente], HOJE).map((o) => o.titulo)).toEqual([bronze.titulo]);
  });
});

describe("blocoDeOfertas", () => {
  it("sem oferta vigente, manda não falar de preço", () => {
    const texto = blocoDeOfertas([bronze], HOJE);
    expect(texto).toContain("não existe nenhuma oferta vigente");
    expect(texto).toContain("Não cite preço");
    expect(texto).not.toContain("375");
  });

  it("com oferta vigente, lista só ela e proíbe o resto", () => {
    const texto = blocoDeOfertas([bronze, vigente], HOJE);
    expect(texto).toContain(vigente.titulo);
    expect(texto).not.toContain("375");
    expect(texto).toContain("não existe e não pode ser mencionado");
  });

  it("mostra o prazo quando existe", () => {
    expect(blocoDeOfertas([vigente], HOJE)).toContain("válida até 2026-09-30");
  });
});

describe("pareceConterPreco", () => {
  it("reconhece as formas de escrever valor", () => {
    expect(pareceConterPreco("licença por R$ 375")).toBe(true);
    expect(pareceConterPreco("são 660 reais")).toBe(true);
    expect(pareceConterPreco("40% de desconto")).toBe(true);
    expect(pareceConterPreco("por apenas isso")).toBe(true);
    expect(pareceConterPreco("é por tempo limitado")).toBe(true);
    expect(pareceConterPreco("condição promocional")).toBe(true);
  });

  it("não acusa texto comum", () => {
    expect(pareceConterPreco("O PDA mapeia perfil comportamental.")).toBe(false);
    expect(pareceConterPreco("")).toBe(false);
    expect(pareceConterPreco(null)).toBe(false);
  });
});

describe("ofertas por público", () => {
  const black: Oferta[] = [
    {
      titulo: "PDA acima de 250 créditos",
      detalhe: "20% de desconto",
      validoAte: "2026-09-30",
      publico: "consultoria",
    },
    {
      titulo: "PDA sem mínimo",
      detalhe: "20% de desconto",
      validoAte: "2026-09-30",
      publico: "empresa",
    },
    {
      titulo: "30% nos serviços",
      detalhe: "workshops, treinamentos e capacitações",
      validoAte: "2026-09-30",
      publico: "todos",
    },
  ];
  const hoje = new Date("2026-09-15T12:00:00");

  it("não mostra à empresa a oferta que é só de consultoria", () => {
    const vistas = ofertasDoPublico(black, "empresa").map((o) => o.titulo);
    expect(vistas).toContain("PDA sem mínimo");
    expect(vistas).toContain("30% nos serviços");
    expect(vistas).not.toContain("PDA acima de 250 créditos");
  });

  it("não mostra à consultoria a oferta que é só de empresa", () => {
    const vistas = ofertasDoPublico(black, "consultoria").map((o) => o.titulo);
    expect(vistas).toContain("PDA acima de 250 créditos");
    expect(vistas).not.toContain("PDA sem mínimo");
  });

  it("oferta sem público marcado vale para todo mundo", () => {
    const antiga: Oferta[] = [{ titulo: "X", detalhe: "y", validoAte: null }];
    expect(ofertasDoPublico(antiga, "consultoria")).toHaveLength(1);
    expect(ofertasDoPublico(antiga, "empresa")).toHaveLength(1);
  });

  it("o bloco do prompt só lista o que vale para aquele público", () => {
    const bloco = blocoDeOfertas(black, hoje, "empresa");
    expect(bloco).toContain("PDA sem mínimo");
    expect(bloco).not.toContain("acima de 250");
  });

  it("depois de 30 de setembro a campanha some sozinha", () => {
    const bloco = blocoDeOfertas(black, new Date("2026-10-01T09:00:00"), "consultoria");
    expect(bloco).toContain("não existe nenhuma oferta vigente");
  });
});

describe("lead sem tipo, típico de campanha de WhatsApp", () => {
  const black: Oferta[] = [
    { titulo: "só consultoria", detalhe: "x", validoAte: null, publico: "consultoria" },
    { titulo: "só empresa", detalhe: "x", validoAte: null, publico: "empresa" },
    { titulo: "para todos", detalhe: "x", validoAte: null, publico: "todos" },
  ];

  it("indefinido só enxerga o que vale para todo mundo", () => {
    const vistas = ofertasDoPublico(black, "indefinido").map((o) => o.titulo);
    expect(vistas).toEqual(["para todos"]);
  });

  it("o prompt manda descobrir o tipo antes de citar condição específica", () => {
    const bloco = blocoDeOfertas(black, new Date(), "indefinido");
    expect(bloco).toContain("Descubra isso em uma pergunta");
    expect(bloco).not.toContain("só consultoria");
    expect(bloco).not.toContain("só empresa");
  });

  it("oferta sem público marcado não vaza para o indefinido", () => {
    // Antes da campanha as ofertas não tinham público; elas valiam para todos,
    // mas aqui o silêncio não pode ser lido como permissão.
    const antiga: Oferta[] = [{ titulo: "antiga", detalhe: "x", validoAte: null }];
    expect(ofertasDoPublico(antiga, "indefinido")).toHaveLength(0);
  });
});
