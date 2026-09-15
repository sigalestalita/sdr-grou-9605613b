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
