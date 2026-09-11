import { describe, expect, it } from "vitest";
import { RETOMADA_TEMPLATES, validateRetomadaTemplate } from "./retomada-templates";

describe("RETOMADA_TEMPLATES", () => {
  it("tem os três modelos, com nome de HSM único", () => {
    const nomes = RETOMADA_TEMPLATES.map((t) => t.provider_template_name);
    expect(nomes).toEqual(["retomada_contato", "remarcar_reuniao", "envio_material_pda"]);
    expect(new Set(nomes).size).toBe(3);
  });

  it("passa nos limites da Meta", () => {
    for (const t of RETOMADA_TEMPLATES) {
      expect(validateRetomadaTemplate(t)).toEqual([]);
    }
  });

  it("usa nome de HSM no formato que a Meta aceita", () => {
    for (const t of RETOMADA_TEMPLATES) {
      expect(t.provider_template_name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("todos abrem espaço para o lead responder com um toque", () => {
    for (const t of RETOMADA_TEMPLATES) {
      expect(t.buttons.length).toBeGreaterThan(0);
    }
  });
});

describe("validateRetomadaTemplate", () => {
  const base = RETOMADA_TEMPLATES[0];

  it("reclama de corpo começando ou terminando em variável", () => {
    expect(validateRetomadaTemplate({ ...base, body: "{{primeiro_nome}}, tudo bem?" })).toContain(
      "corpo não pode começar com variável",
    );
    expect(validateRetomadaTemplate({ ...base, body: "Oi, tudo bem {{primeiro_nome}}" })).toContain(
      "corpo não pode terminar com variável",
    );
  });

  it("reclama de botão e rodapé longos", () => {
    const t = {
      ...base,
      footer_text: "x".repeat(61),
      buttons: [{ type: "QUICK_REPLY" as const, text: "x".repeat(26) }],
    };
    const erros = validateRetomadaTemplate(t);
    expect(erros).toContain("rodapé passa de 60 caracteres");
    expect(erros.some((e) => e.includes("passa de 25 caracteres"))).toBe(true);
  });

  it("reclama de variável declarada que não aparece no corpo", () => {
    expect(validateRetomadaTemplate({ ...base, variables: ["empresa"] })).toContain(
      "variável empresa não aparece no corpo",
    );
  });
});
