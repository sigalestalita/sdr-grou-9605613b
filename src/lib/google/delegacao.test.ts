import { describe, expect, it } from "vitest";
import { ESCOPO_DELEGACAO, jwtDaDelegacao } from "./delegacao.server";

const dec = (s: string) =>
  JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));

describe("jwtDaDelegacao", () => {
  it("assina em nome da pessoa, só com leitura de agenda, e a assinatura confere", async () => {
    const par = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", par.privateKey)).toString(
      "base64",
    );
    // Como vem no .json do Google: PEM com "\n" escapado.
    const pem = `-----BEGIN PRIVATE KEY-----\\n${der}\\n-----END PRIVATE KEY-----\\n`;
    const jwt = await jwtDaDelegacao(
      { client_email: "compass@projeto.iam.gserviceaccount.com", private_key: pem },
      "marcela.vaz@grougp.com.br",
      Date.UTC(2026, 10, 28, 12),
    );
    const [h, c, a] = jwt.split(".");
    expect(dec(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const corpo = dec(c);
    expect(corpo.sub).toBe("marcela.vaz@grougp.com.br");
    expect(corpo.scope).toBe(ESCOPO_DELEGACAO);
    expect(corpo.exp - corpo.iat).toBe(3600);
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      par.publicKey,
      Buffer.from(a.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });
});
