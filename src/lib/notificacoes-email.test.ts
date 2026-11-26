import { describe, expect, it } from "vitest";
import { linkAbsoluto, montarEmailDaMencao } from "./notificacoes-email";

describe("montarEmailDaMencao", () => {
  it("leva título, texto escapado e link absoluto do Compass", () => {
    const e = montarEmailDaMencao({
      titulo: "Ana mencionou você em Acme",
      corpo: "Olha <isso> & aquilo",
      link: "/negocio/123",
    });
    expect(e.assunto).toBe("Ana mencionou você em Acme");
    expect(e.html).toContain("Olha &lt;isso&gt; &amp; aquilo");
    expect(e.html).toContain("https://compass.grougp.com/negocio/123");
    expect(e.texto).toContain("Abrir no Compass: https://compass.grougp.com/negocio/123");
  });

  it("link vazio cai na página inicial; link completo fica como está", () => {
    expect(linkAbsoluto(null)).toBe("https://compass.grougp.com");
    expect(linkAbsoluto("https://x.com/a")).toBe("https://x.com/a");
  });
});
