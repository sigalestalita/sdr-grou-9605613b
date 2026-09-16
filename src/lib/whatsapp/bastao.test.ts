import { describe, expect, it } from "vitest";
import { mensagemSubstantiva, pedidoExplicitoDeBastao, podePassarBastao } from "./bastao";

describe("pedido explícito", () => {
  it("reconhece pedido de pessoa", () => {
    expect(pedidoExplicitoDeBastao("quero falar com uma pessoa")).toBe(true);
    expect(pedidoExplicitoDeBastao("tem atendimento humano?")).toBe(true);
  });

  it("reconhece pedido de agenda e de proposta", () => {
    expect(pedidoExplicitoDeBastao("podemos marcar uma reunião?")).toBe(true);
    expect(pedidoExplicitoDeBastao("me manda uma proposta")).toBe(true);
  });

  it("não confunde interesse com pedido", () => {
    // Foi exatamente aqui que a IA transferia cedo demais.
    expect(pedidoExplicitoDeBastao("promoção da black")).toBe(false);
    expect(pedidoExplicitoDeBastao("desenvolvimento")).toBe(false);
    expect(pedidoExplicitoDeBastao("quero saber valores pda")).toBe(false);
  });
});

describe("mensagem substantiva", () => {
  it("saudação e monossílabo não contam", () => {
    for (const t of ["oi", "olá", "ok", "sim", "bom dia", "obrigada"]) {
      expect({ [t]: mensagemSubstantiva(t) }).toEqual({ [t]: false });
    }
  });

  it("resposta com conteúdo conta", () => {
    expect(mensagemSubstantiva("desenvolvimento")).toBe(true);
    expect(mensagemSubstantiva("somos uma indústria de 40 pessoas")).toBe(true);
  });
});

describe("podePassarBastao", () => {
  it("bloqueia o caso real: oi + promoção da black", () => {
    const r = podePassarBastao(["oi", "promoção da black"]);
    expect(r.liberado).toBe(false);
    expect(r.substantivas).toBe(1);
  });

  it("bloqueia o outro caso real: oi + desenvolvimento", () => {
    expect(podePassarBastao(["oi", "desenvolvimento"]).liberado).toBe(false);
  });

  it("libera depois de duas respostas com conteúdo", () => {
    const r = podePassarBastao(["oi", "desenvolvimento", "somos 40 pessoas, começando agora"]);
    expect(r.liberado).toBe(true);
    expect(r.substantivas).toBe(2);
  });

  it("pedido explícito passa na hora, sem qualificação nenhuma", () => {
    const r = podePassarBastao(["quero falar com uma pessoa"]);
    expect(r.liberado).toBe(true);
    expect(r.motivo).toContain("pediu");
  });
});
