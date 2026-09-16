import { describe, expect, it } from "vitest";
import { removerSaudacaoRepetida } from "./saudacao";

describe("removerSaudacaoRepetida", () => {
  it("corta o caso real: saudação mais reapresentação", () => {
    const r = removerSaudacaoRepetida(
      "Olá Ana Paula! Lisiane aqui da Grou.\n\nVi que você demonstrou interesse em nossas soluções. O que te motivou a buscar a Grou neste momento?",
      true,
    );
    expect(r).not.toMatch(/Olá|Lisiane aqui/);
    expect(r).toContain("O que te motivou");
  });

  it("corta saudação sozinha", () => {
    const r = removerSaudacaoRepetida("Oi, Ana! Qual é o maior desafio aí hoje?", true);
    expect(r).toBe("Qual é o maior desafio aí hoje?");
  });

  it("não mexe na primeira mensagem da conversa", () => {
    const t = "Olá Ana Paula! Lisiane aqui da Grou. Como posso ajudar?";
    expect(removerSaudacaoRepetida(t, false)).toBe(t);
  });

  it("não mexe em resposta que já começa direto", () => {
    const t = "Perfeito. Vocês já usam alguma ferramenta de perfil comportamental hoje?";
    expect(removerSaudacaoRepetida(t, true)).toBe(t);
  });

  it("devolve o original quando cortar deixaria quase nada", () => {
    const t = "Oi!";
    expect(removerSaudacaoRepetida(t, true)).toBe("Oi!");
  });

  it("não come o conteúdo quando a saudação é parte da frase", () => {
    const t = "Boa tarde para começar já te adianto que a condição vale até dia 30";
    const r = removerSaudacaoRepetida(t, true);
    expect(r).toContain("condição vale até dia 30");
  });
});
