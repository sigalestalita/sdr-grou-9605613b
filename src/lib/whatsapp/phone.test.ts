import { describe, expect, it } from "vitest";
import { phoneDigits, phoneKey, sameNumber, ultimos4 } from "./phone";

describe("phoneKey", () => {
  it("iguala o formatado do formulário com o cru do webhook", () => {
    // O caso real: lead da ELOS DH gravado formatado, resposta chegando crua.
    expect(phoneKey("+55 (11) 95667-2656")).toBe(phoneKey("5511956672656"));
  });

  it("iguala com e sem o nono dígito, que a Meta às vezes omite", () => {
    expect(phoneKey("5511956672656")).toBe(phoneKey("551156672656"));
  });

  it("não mistura DDDs diferentes com o mesmo final", () => {
    expect(phoneKey("5511956672656")).not.toBe(phoneKey("5521956672656"));
  });

  it("aceita o número digitado sem o código do país", () => {
    expect(phoneKey("11 95667 2656")).toBe(phoneKey("+55 (11) 95667-2656"));
  });

  it("devolve nulo para vazio", () => {
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey("   ")).toBeNull();
  });

  it("mantém número estrangeiro inteiro, sem cortar", () => {
    // +1 415 555 2671 não tem DDD brasileiro nem nono dígito.
    expect(phoneKey("+1 415 555 2671")).toBe(phoneKey("14155552671"));
    expect(phoneKey("+1 415 555 2671")).not.toBe(phoneKey("+1 305 555 2671"));
  });
});

describe("sameNumber", () => {
  it("compara os formatos que o sistema recebe na prática", () => {
    expect(sameNumber("+55 (11) 95667-2656", "5511956672656")).toBe(true);
    expect(sameNumber("5511956672656", "5511999999999")).toBe(false);
  });

  it("nunca dá igual quando falta um dos lados", () => {
    expect(sameNumber(null, "5511956672656")).toBe(false);
    expect(sameNumber("5511956672656", "")).toBe(false);
  });
});

describe("ultimos4", () => {
  it("sobrevive à formatação, que é o ponto", () => {
    expect(ultimos4("+55 (11) 95667-2656")).toBe("2656");
    expect(ultimos4("5511956672656")).toBe("2656");
  });
});

describe("phoneDigits", () => {
  it("tira máscara e zeros à esquerda", () => {
    expect(phoneDigits("0055 (11) 95667-2656")).toBe("5511956672656");
  });
});
