import { describe, expect, it } from "vitest";
import { nomeDaConversa, telefoneLegivel } from "./nome-da-conversa";

describe("nomeDaConversa", () => {
  it("prefere o nome do lead", () => {
    expect(nomeDaConversa({ name: "Ana" }, { name: "Ana WhatsApp", phone: "5551999969371" })).toBe(
      "Ana",
    );
  });
  it("sem lead, usa o nome do contato", () => {
    expect(nomeDaConversa(null, { name: "Talita", phone: "5551999969371" })).toBe("Talita");
  });
  it("sem nome nenhum, mostra o número", () => {
    expect(nomeDaConversa(null, { name: " ", phone: "5551999969371" })).toBe("(51) 99996-9371");
    expect(nomeDaConversa({ name: null }, { phone: "555133334444" })).toBe("(51) 3333-4444");
  });
  it("sem número, Sem nome", () => {
    expect(nomeDaConversa(null, null)).toBe("Sem nome");
  });
  it("número estrangeiro fica com +", () => {
    expect(telefoneLegivel("4915123456789")).toBe("+4915123456789");
  });
});
