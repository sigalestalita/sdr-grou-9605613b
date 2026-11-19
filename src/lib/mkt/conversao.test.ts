import { describe, expect, it } from "vitest";
import {
  caiuNoHoneypot,
  chaveDeIdempotencia,
  corpoDaConversao,
  decidirAcao,
  origemPermitida,
} from "./conversao";

const base = {
  chave: "gp_ZlzkL3yWNbVWyDxwZr8t2",
  nome: "Ana",
  email: "Ana@Empresa.com.br",
  aceita_contato: true,
  respostas: { desafio: "Time sob pressão" },
};

describe("CORS da rota de conversão", () => {
  it("aceita o site, o domínio sem www e prévias da Vercel", () => {
    expect(origemPermitida("https://www.grougp.com")).toBe(true);
    expect(origemPermitida("https://grougp.com")).toBe(true);
    expect(origemPermitida("https://site-grou-git-main-grou.vercel.app")).toBe(true);
  });
  it("recusa outros sites e http", () => {
    expect(origemPermitida("https://evil.com")).toBe(false);
    expect(origemPermitida("http://www.grougp.com")).toBe(false);
    expect(origemPermitida("https://vercel.app.evil.com")).toBe(false);
    expect(origemPermitida("https://grougp.com.evil.com")).toBe(false);
  });
});

describe("corpo da conversão", () => {
  it("e-mail é obrigatório e validado", () => {
    expect(corpoDaConversao.safeParse({ ...base, email: undefined }).success).toBe(false);
    expect(corpoDaConversao.safeParse({ ...base, email: "nao-e-email" }).success).toBe(false);
  });
  it("guarda o e-mail em minúsculas", () => {
    const r = corpoDaConversao.parse(base);
    expect(r.email).toBe("ana@empresa.com.br");
  });
  it("teste:true é reconhecido", () => {
    expect(corpoDaConversao.parse({ ...base, teste: true }).teste).toBe(true);
    expect(corpoDaConversao.parse(base).teste).toBe(false);
  });
});

describe("honeypot", () => {
  it("campo site preenchido é robô", () => {
    expect(caiuNoHoneypot({ ...base, site: "http://spam" })).toBe(true);
  });
  it("campo site vazio ou ausente passa", () => {
    expect(caiuNoHoneypot({ ...base, site: "" })).toBe(false);
    expect(caiuNoHoneypot(base)).toBe(false);
  });
});

describe("idempotência de 10 minutos", () => {
  const t = new Date("2026-11-19T13:00:00Z");
  it("mesmo e-mail no mesmo ativo dentro da janela gera a mesma chave", () => {
    const depois = new Date(t.getTime() + 9 * 60_000);
    expect(chaveDeIdempotencia("a1", "Ana@x.com", t)).toBe(chaveDeIdempotencia("a1", "ana@x.com", depois));
  });
  it("outro ativo não é duplicata", () => {
    expect(chaveDeIdempotencia("a1", "ana@x.com", t)).not.toBe(chaveDeIdempotencia("a2", "ana@x.com", t));
  });
});

describe("o que fazer com o card", () => {
  const aberto = { id: "l1", oculto: false, etapaSlug: "em_contato", etapaTerminal: false };
  it("sem card: cria em Novo lead", () => {
    expect(decidirAcao("sempre", null)).toBe("criar_card");
  });
  it("card aberto com o mesmo e-mail: registra nele, não cria outro", () => {
    expect(decidirAcao("sempre", aberto)).toBe("registrar_no_card_existente");
  });
  it("card escondido do kanban volta para Novo lead", () => {
    expect(decidirAcao("sempre", { ...aberto, oculto: true })).toBe("reativar_card");
  });
  it("ativo com regra nunca não passa ao SDR", () => {
    expect(decidirAcao("nunca", null)).toBe("so_conversao");
  });
});
