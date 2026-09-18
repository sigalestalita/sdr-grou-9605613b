import { describe, expect, it } from "vitest";
import {
  anunciaBastao,
  concordaComBastao,
  jaAnunciouBastao,
  topouOBastao,
} from "./anuncio-de-bastao";

describe("anunciaBastao", () => {
  it("reconhece o aviso da conversa real", () => {
    expect(
      anunciaBastao(
        "Para você conhecer o PDA em detalhes, a pessoa especialista na ferramenta vai te explicar como funciona. Combinado?",
      ),
    ).toBe(true);
    expect(
      anunciaBastao(
        "nossa pessoa especialista vai te chamar aqui no WhatsApp para já agendar um bate-papo",
      ),
    ).toBe(true);
    expect(anunciaBastao("Vou te passar para a responsável pela sua região")).toBe(true);
  });

  it("não confunde pergunta de qualificação com aviso", () => {
    expect(anunciaBastao("Me conta, como o PDA pode ajudar seus clientes?")).toBe(false);
    expect(anunciaBastao("Você busca para a sua empresa ou para atender outras?")).toBe(false);
  });
});

describe("concordaComBastao", () => {
  it("reconhece o sim curto", () => {
    for (const t of ["Combinado", "combinado!", "Pode ser", "ok", "Perfeito", "fico no aguardo"]) {
      expect(concordaComBastao(t)).toBe(true);
    }
  });

  it("não trata pergunta como concordância", () => {
    expect(concordaComBastao("Quanto custa?")).toBe(false);
    expect(concordaComBastao("Não enxergo. Quero conhecer para entender")).toBe(false);
  });
});

describe("topouOBastao", () => {
  const anuncio = {
    sender_type: "bot",
    body: "a pessoa especialista vai te explicar como funciona. Combinado?",
  };

  it("transfere quando o lead topa o aviso já dado", () => {
    expect(topouOBastao([anuncio, { sender_type: "lead", body: "Combinado" }])).toBe(true);
  });

  it("não transfere se ainda não avisamos nada", () => {
    expect(topouOBastao([{ sender_type: "lead", body: "Combinado" }])).toBe(false);
  });

  it("não reabre a transferência numa concordância antiga", () => {
    expect(
      topouOBastao([
        anuncio,
        { sender_type: "lead", body: "Combinado" },
        { sender_type: "bot", body: "Perfeito!" },
        { sender_type: "lead", body: "Aliás, quanto custa a licença?" },
      ]),
    ).toBe(false);
  });

  it("aguenta conversa vazia", () => {
    expect(topouOBastao([])).toBe(false);
    expect(jaAnunciouBastao([])).toBe(false);
  });
});
