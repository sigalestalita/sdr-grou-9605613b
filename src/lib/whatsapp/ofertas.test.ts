import { describe, expect, it } from "vitest";
import {
  blocoDeOfertas,
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
