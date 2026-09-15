import { describe, expect, it } from "vitest";
import { validateRetomadaTemplate } from "./retomada-templates";
import { PRIMEIRO_CONTATO_TEMPLATES, TEMPLATES_DO_SISTEMA } from "./templates-do-sistema";

describe("templates do sistema", () => {
  it("todos passam nas regras da Meta", () => {
    for (const t of TEMPLATES_DO_SISTEMA) {
      expect({ [t.provider_template_name]: validateRetomadaTemplate(t) }).toEqual({
        [t.provider_template_name]: [],
      });
    }
  });

  it("nenhum nome de HSM se repete", () => {
    const nomes = TEMPLATES_DO_SISTEMA.map((t) => t.provider_template_name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("o primeiro contato se apresenta pelo nome do SDR, sem prometer outra pessoa", () => {
    for (const t of PRIMEIRO_CONTATO_TEMPLATES) {
      expect(t.variables).toContain("sdr");
      expect(t.body).toContain("{{sdr}}");
      expect(t.body.toLowerCase()).not.toContain("especialista");
      expect(t.body.toLowerCase()).not.toContain("em breve");
    }
  });
});
