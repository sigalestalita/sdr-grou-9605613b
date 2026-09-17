import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_DESCARTE,
  agruparMotivos,
  motivoOficial,
  valorDoMotivo,
} from "./motivos-descarte";

describe("motivos de descarte", () => {
  it("reconhece a grafia com acento, caixa e espaço trocados", () => {
    expect(motivoOficial("SEM PERFIL")).toBe("Sem perfil");
    expect(motivoOficial("  sem   contato ")).toBe("Sem contato");
    expect(motivoOficial("Concorrencia")).toBe("Concorrência");
    expect(motivoOficial("sem orçamento")).toBe("Sem orçamento");
  });

  it("junta sinônimos no mesmo motivo", () => {
    expect(motivoOficial("sem retorno")).toBe("Sem contato");
    expect(motivoOficial("não respondeu")).toBe("Sem contato");
    expect(motivoOficial("duplicado")).toBe("Lead duplicado");
  });

  it("devolve null para texto que ninguém padronizou", () => {
    expect(motivoOficial("fechou com a prima")).toBeNull();
    expect(motivoOficial("")).toBeNull();
    expect(motivoOficial(null)).toBeNull();
  });

  it("agrupa as variações numa linha só, somando o total", () => {
    const grupos = agruparMotivos([
      "Sem perfil",
      "sem perfil",
      "SEM PERFIL",
      "sem retorno",
      "Sem contato",
    ]);
    expect(grupos).toHaveLength(2);
    const perfil = grupos.find((g) => g.valor === "Sem perfil");
    expect(perfil?.total).toBe(3);
    expect(grupos.find((g) => g.valor === "Sem contato")?.total).toBe(2);
  });

  it("mantém o texto livre visível, com a grafia mais usada", () => {
    const grupos = agruparMotivos([
      "comprou do vizinho",
      "Comprou do vizinho",
      "comprou do vizinho",
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].livre).toBe(true);
    expect(grupos[0].rotulo).toBe("comprou do vizinho");
    expect(grupos[0].total).toBe(3);
  });

  it("ignora vazio e só espaço", () => {
    expect(agruparMotivos(["", "   ", null, undefined])).toEqual([]);
  });

  it("dá ao lead a mesma chave que o grupo do filtro", () => {
    const grupos = agruparMotivos(["sem retorno"]);
    expect(valorDoMotivo("Não respondeu")).toBe(grupos[0].valor);
    expect(valorDoMotivo("  ")).toBeNull();
  });

  it("toda opção oficial se reconhece a si mesma", () => {
    for (const m of MOTIVOS_DE_DESCARTE) expect(motivoOficial(m)).toBe(m);
  });
});
