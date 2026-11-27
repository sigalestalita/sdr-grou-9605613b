import { describe, expect, it } from "vitest";
import { juntarEtapas, type EtapaDeFunil } from "./comercial.functions";

const e = (pipeline_id: string, ordem: number, nome: string, kind = "open"): EtapaDeFunil => ({
  id: `${pipeline_id}:${nome}`,
  pipeline_id,
  nome,
  slug: nome,
  ordem,
  probabilidade: 0,
  kind,
});

// Etapas reais dos quatro funis comerciais (27/11/2026).
const ETAPAS: EtapaDeFunil[] = [
  e("nn", 1, "Agendamento"),
  e("nn", 2, "Validação dos influenciadores"),
  e("nn", 3, "Validação com o decisor"),
  e("nn", 4, "Fazer proposta"),
  e("nn", 5, "Envio de proposta"),
  e("nn", 6, "Em tomada de decisão"),
  e("nn", 7, "Emissão de OC/Contrato"),
  e("nn", 8, "Qualificação"),
  e("nn", 8, "Venda", "won"),
  e("nn", 9, "Perda", "lost"),
  e("up", 1, "Selecionados"),
  e("up", 2, "Proposta"),
  e("up", 3, "Agendamento"),
  e("up", 4, "Validação dos influenciadores"),
  e("up", 5, "Em tomada de decisão"),
  e("up", 3, "Venda", "won"),
  e("up", 4, "Perda", "lost"),
  e("cs", 6, "Envio de Proposta"),
  e("cs", 8, "Em tomada de decisão"),
  e("ind", 2, "Negociação"),
];

describe("todos os funis comerciais", () => {
  it("junta etapas de mesmo nome numa coluna, na ordem do Novos Negócios, com venda e perda no fim", () => {
    const { etapas, etapaDe } = juntarEtapas(ETAPAS, "nn");
    const nomes = etapas.map((x) => x.nome);
    expect(nomes.slice(-2)).toEqual(["Venda", "Perda"]);
    expect(nomes.filter((n) => n.toLowerCase() === "envio de proposta")).toHaveLength(1);
    expect(nomes.filter((n) => n === "Em tomada de decisão")).toHaveLength(1);
    // só de outros funis vêm antes das do Novos Negócios
    expect(nomes.indexOf("Selecionados")).toBeLessThan(nomes.indexOf("Agendamento"));
    expect(nomes.indexOf("Agendamento")).toBeLessThan(nomes.indexOf("Em tomada de decisão"));
    expect(etapaDe("up:Em tomada de decisão")).toBe(etapaDe("nn:Em tomada de decisão"));
    expect(etapaDe("cs:Envio de Proposta")).toBe(etapaDe("nn:Envio de proposta"));
    expect(etapaDe("up:Venda")).toBe(etapaDe("nn:Venda"));
    expect(etapaDe(null)).toBeNull();
  });
});
