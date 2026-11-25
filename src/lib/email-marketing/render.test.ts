import { describe, expect, it } from "vitest";
import {
  LOGO_EMAIL_URL,
  primeiroNome,
  renderEmail,
  textoParaHtml,
  avisosDoConteudo,
  topoDoEmail,
  trocar,
  variaveisDesconhecidas,
} from "./render";

describe("render de e-mail", () => {
  it("troca variáveis, com padrão quando vazio", () => {
    expect(trocar("Oi {{primeiro_nome|tudo bem}}!", { primeiro_nome: "" })).toBe("Oi tudo bem!");
    expect(trocar("Oi {{ primeiro_nome }}", { primeiro_nome: "Ana" })).toBe("Oi Ana");
    expect(primeiroNome("MARIA souza")).toBe("Maria");
    expect(primeiroNome("ana@x.com")).toBe("");
  });

  it("itálico, sublinhado, cor e marca-texto, combináveis; cor inválida não vira CSS", () => {
    const h = textoParaHtml(
      "Um *itálico*, __sublinhado__ e {cor:#c2410c}**laranja forte**{/cor} com {fundo:#fef08a}destaque{/fundo}. {cor:red;x}nada{/cor}",
    );
    expect(h).toContain("<em>itálico</em>");
    expect(h).toContain("<u>sublinhado</u>");
    expect(h).toContain('<span style="color:#c2410c;"><strong>laranja forte</strong></span>');
    expect(h).toContain("background:#fef08a");
    expect(h).not.toContain("color:red");
  });

  it("lista com * não vira itálico; ** continua negrito", () => {
    const h = textoParaHtml("* um\n* dois\n\n**forte** e *leve*");
    expect(h).toContain("<li");
    expect(h).toContain("<strong>forte</strong>");
    expect(h).toContain("<em>leve</em>");
  });

  it("imagem no meio do texto, com largura e link rastreado; divisória e centralizado", () => {
    const h = textoParaHtml(
      "Antes\n\n![Banner do evento](https://x.com/a.png)\n\n![Logo|40%](https://x.com/l.png)(https://grou.com.br)\n\n---\n\n-> Centro\nFora",
      (u) => `T(${u})`,
    );
    expect(h).toContain('src="https://x.com/a.png"');
    expect(h).toContain('alt="Banner do evento"');
    expect(h).toContain('width="218"');
    expect(h).toContain('href="T(https://grou.com.br)"');
    expect(h).toContain("<hr");
    expect(h).toContain('text-align:center;">Centro</p>');
    expect(h).toContain(">Fora</p>");
  });

  it("imagem http (sem s) não vira imagem", () => {
    expect(textoParaHtml("![x](http://x.com/a.png)")).not.toContain("<img");
  });

  it("versão em texto puro tira a marcação nova", () => {
    const r = renderEmail({
      assunto: "a",
      corpo:
        "*oi* {cor:#ff0000}vermelho{/cor}\n![Banner](https://x.com/a.png)(https://grou.com.br)\n-> fim",
      formato: "texto",
      contato: { email: "a@b.com" },
      urlDescadastro: "https://d",
    });
    expect(r.texto).toContain("oi vermelho");
    expect(r.texto).toContain("[Banner] https://grou.com.br");
    expect(r.texto).not.toContain("->");
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

describe("topo do e-mail", () => {
  it("usa o logo da Grou quando a campanha não tem imagem", () => {
    expect(topoDoEmail(null)).toContain(LOGO_EMAIL_URL);
    expect(topoDoEmail("http://inseguro.com/x.png")).toContain(LOGO_EMAIL_URL);
  });
  it("usa a imagem da campanha quando ela é https", () => {
    const html = topoDoEmail("https://exemplo.com/banner.png");
    expect(html).toContain('src="https://exemplo.com/banner.png"');
    expect(html).not.toContain(LOGO_EMAIL_URL);
  });

  it("avisos antes do disparo", () => {
    const ok = avisosDoConteudo({
      assunto: "Oi {{primeiro_nome}}",
      preheader: "Novidade",
      corpo:
        "Texto com bastante conteúdo para não ser só imagem, explicando a novidade do mês.\n\n![Banner](https://x.com/a.png)\n\n[[Ver|https://grou.com.br]]",
      formato: "texto",
    });
    expect(ok).toEqual([]);
    const ruim = avisosDoConteudo({
      assunto: "",
      corpo: "![](http://x.com/a.png)\n{cor:#f00}oi {{cargo}}",
      formato: "texto",
    });
    const textos = ruim.map((a) => a.texto).join(" | ");
    expect(ruim.filter((a) => a.nivel === "erro")).toHaveLength(2);
    expect(textos).toContain("{{cargo}}");
    expect(textos).toContain("sem descrição");
    expect(textos).toContain("sem fechar");
    expect(textos).toContain("Nenhum link");
  });
});
