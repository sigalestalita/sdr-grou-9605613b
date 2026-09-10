import { describe, expect, it } from "vitest";
import { explainWhatsappError } from "./send-error";

describe("explainWhatsappError", () => {
  it("reconhece a janela de 24h pelo código da Meta", () => {
    const r = explainWhatsappError(
      "(#131047) Message failed to send because more than 24 hours have passed since the customer last replied to this number",
    );
    expect(r.code).toBe("131047");
    expect(r.title).toContain("24h");
    expect(r.action).toContain("template");
    expect(r.scope).toBe("conversa");
  });

  it("reconhece token expirado e marca como problema da conta", () => {
    const r = explainWhatsappError("(#190) Error validating access token: Session has expired");
    expect(r.code).toBe("190");
    expect(r.scope).toBe("conta");
    expect(r.action).toContain("Contas");
  });

  it("reconhece número que não recebe", () => {
    expect(explainWhatsappError("(#131026) Message undeliverable").title).toContain(
      "não pode receber",
    );
  });

  it("reconhece limite por contato e limite da conta", () => {
    expect(explainWhatsappError("(#131056) pair rate limit hit").scope).toBe("conversa");
    expect(explainWhatsappError("(#130429) Rate limit hit").scope).toBe("conta");
  });

  it("cai no texto quando não vem código", () => {
    const r = explainWhatsappError("access_token ausente na conta");
    expect(r.scope).toBe("conta");
    expect(r.title).toContain("expirou");
  });

  it("trata falha de rede como reenviável", () => {
    expect(explainWhatsappError("fetch failed").action).toContain("reenviar");
  });

  it("devolve o genérico quando não reconhece, preservando o código", () => {
    const r = explainWhatsappError("(#999999) algo muito novo");
    expect(r.code).toBe("999999");
    expect(r.scope).toBe("desconhecido");
  });

  it("aguenta erro vazio", () => {
    expect(explainWhatsappError(null).title).toBeTruthy();
    expect(explainWhatsappError("").code).toBeNull();
  });
});
