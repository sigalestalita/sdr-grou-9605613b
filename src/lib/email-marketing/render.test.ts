import { describe, expect, it } from "vitest";
import { primeiroNome, renderEmail, textoParaHtml, trocar, variaveisDesconhecidas } from "./render";

describe("render de e-mail", () => {
  it("troca variáveis, com padrão quando vazio", () => {
    expect(trocar("Oi {{primeiro_nome|tudo bem}}!", { primeiro_nome: "" })).toBe("Oi tudo bem!");
    expect(trocar("Oi {{ primeiro_nome }}", { primeiro_nome: "Ana" })).toBe("Oi Ana");
    expect(primeiroNome("MARIA souza")).toBe("Maria");
    expect(primeiroNome("ana@x.com")).toBe("");
  });

  it("texto simples vira título, lista, negrito, link e botão; escapa HTML", () => {
    const h = textoParaHtml(
      "# Olá\n\nTexto **forte** <b>x</b> e [site](https://grou.com.br)\n- um\n- dois\n\n[[Inscreva-se|https://grou.com.br/a]]",
    );
    expect(h).toContain("<h1");
    expect(h).toContain("<strong>forte</strong>");
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(h).toContain('href="https://grou.com.br"');
    expect(h).toContain("<ul");
    expect(h).toContain(">Inscreva-se</a>");
  });

  it("rastreia links, inclui pixel e descadastro", () => {
    const r = renderEmail({
      assunto: "Oi {{primeiro_nome}}",
      corpo: "Veja https://grou.com.br",
      formato: "texto",
      contato: { nome: "joão silva", email: "j@x.com" },
      urlClique: (u) => `https://c/clique?u=${encodeURIComponent(u)}`,
      urlAbertura: "https://c/abrir.gif",
      urlDescadastro: "https://c/descadastro?t=1",
    });
    expect(r.assunto).toBe("Oi João");
    expect(r.html).toContain("https://c/clique?u=https%3A%2F%2Fgrou.com.br");
    expect(r.html).toContain("https://c/abrir.gif");
    expect(r.html).toContain("https://c/descadastro?t=1");
    expect(r.texto).toContain("https://c/descadastro?t=1");
  });

  it("aponta variáveis desconhecidas", () => {
    expect(variaveisDesconhecidas("{{nome}} {{cargo}} {{empresa}}")).toEqual(["cargo"]);
  });
});
