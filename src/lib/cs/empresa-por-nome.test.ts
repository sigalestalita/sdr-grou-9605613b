import { describe, expect, it } from "vitest";
import { acharEmpresaPorNome, chaveDeNome } from "./empresa-por-nome";

const empresas = [
  { id: "1", nome: "Bocchi Agrobios" },
  { id: "2", nome: "PGT CONSULTORIA E TREINAMENTO" },
  { id: "3", nome: "NETZSCH Bombas & Sistemas Brasil" },
  { id: "4", nome: "Netzsch do Brasil" },
  { id: "5", nome: "Dalmóbile Ltda" },
];

describe("acharEmpresaPorNome", () => {
  it("acha pelo nome igual, sem caixa nem acento nem sufixo", () => {
    expect(acharEmpresaPorNome("BOCCHI AGROBIOS", empresas)?.id).toBe("1");
    expect(acharEmpresaPorNome("DALMOBILE", empresas)?.id).toBe("5");
    expect(chaveDeNome("Empresa X S/A")).toBe("empresa x");
  });
  it("aceita começo do nome quando há um só candidato", () => {
    expect(acharEmpresaPorNome("PGT CONSULTORIA", empresas)?.id).toBe("2");
  });
  it("não escolhe quando há mais de um candidato", () => {
    expect(acharEmpresaPorNome("NETZSCH", empresas)).toBeNull();
  });
  it("não liga nomes diferentes", () => {
    expect(acharEmpresaPorNome("DAL MOBILE", empresas)).toBeNull();
    expect(acharEmpresaPorNome("Interblu", empresas)).toBeNull();
  });
});
