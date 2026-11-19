import { describe, expect, it } from "vitest";
import { enviosDoFormulario } from "./respostas";

describe("respostas do formulário no card", () => {
  it("mostra o primeiro envio e as reconversões, mais recente primeiro", () => {
    const envios = enviosDoFormulario({
      ativo: "Aula G4",
      em: "2026-11-19T10:00:00Z",
      aceita_contato: true,
      respostas: { maior_desafio: "Prazos", participa: true },
      reconversoes: [{ ativo: "Aula G4", em: "2026-11-20T10:00:00Z", respostas: { maior_desafio: "Time" } }],
    });
    expect(envios).toHaveLength(2);
    expect(envios[0].respostas[0]).toEqual({ rotulo: "Maior desafio", valor: "Time" });
    expect(envios[1].respostas).toEqual([
      { rotulo: "Maior desafio", valor: "Prazos" },
      { rotulo: "Participa", valor: "Sim" },
    ]);
  });
  it("lead sem respostas do site não mostra nada", () => {
    expect(enviosDoFormulario({ sheet_tab: "Meta", lead_type: "empresa" })).toEqual([]);
  });
});
