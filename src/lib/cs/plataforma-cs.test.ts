import { describe, expect, it } from "vitest";
import {
  dominioCorporativo,
  ligarUsuario,
  maisRecente,
  montarIndices,
  usouNoPeriodo,
} from "./plataforma-cs";

const idx = montarIndices([
  { clientUid: "acme", email: "Ana@Acme.com.br" },
  { clientUid: "acme", email: "joao@acme.com.br" },
  { clientUid: "beta", email: "maria@gmail.com" },
  // domínio compartilhado por duas empresas: não liga pelo domínio
  { clientUid: "grupo1", email: "x@grupo.com" },
  { clientUid: "grupo2", email: "y@grupo.com" },
]);

describe("ligarUsuario", () => {
  it("liga pelo e-mail exato, sem ligar para maiúsculas", () => {
    expect(ligarUsuario("ana@acme.com.br", idx)).toEqual([
      { clientUid: "acme", ligadoPor: "email" },
    ]);
    expect(ligarUsuario("MARIA@gmail.com", idx)).toEqual([
      { clientUid: "beta", ligadoPor: "email" },
    ]);
  });

  it("sem e-mail exato, liga pelo domínio de uma empresa só", () => {
    expect(ligarUsuario("novo.analista@acme.com.br", idx)).toEqual([
      { clientUid: "acme", ligadoPor: "dominio" },
    ]);
  });

  it("não liga por domínio pessoal nem por domínio de mais de uma empresa", () => {
    expect(ligarUsuario("outra@gmail.com", idx)).toEqual([]);
    expect(ligarUsuario("z@grupo.com", idx)).toEqual([]);
    expect(ligarUsuario("alguem@semcontato.com", idx)).toEqual([]);
  });
});

describe("apoio", () => {
  it("domínio pessoal e da Grou não contam", () => {
    expect(dominioCorporativo("a@hotmail.com")).toBeNull();
    expect(dominioCorporativo("a@grougp.com.br")).toBeNull();
    expect(dominioCorporativo("a@empresa.com.br")).toBe("empresa.com.br");
  });

  it("usou nos últimos 90 dias", () => {
    const agora = new Date("2026-11-26T12:00:00Z");
    expect(usouNoPeriodo({ ultimaAtividade: "2026-10-01T00:00:00Z" }, agora)).toBe(true);
    expect(usouNoPeriodo({ ultimaAtividade: "2026-07-01T00:00:00Z" }, agora)).toBe(false);
    expect(usouNoPeriodo({ ultimaAtividade: null }, agora)).toBe(false);
  });

  it("pega a data mais recente", () => {
    expect(maisRecente(null, "2026-11-01T00:00:00Z", "2026-11-20T00:00:00Z")).toBe(
      "2026-11-20T00:00:00Z",
    );
    expect(maisRecente(null, undefined)).toBeNull();
  });
});
