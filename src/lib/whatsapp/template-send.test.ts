import { describe, expect, it } from "vitest";
import { resolveTemplateSendParams } from "./template-send.server";

const conta = { access_token: "x", provider_base_url: null };

describe("resolveTemplateSendParams", () => {
  it("resolve o nome do lead e o do SDR na ordem das variáveis", async () => {
    const { bodyParams } = await resolveTemplateSendParams({
      account: conta,
      storedVariables: ["primeiro_nome", "sdr"],
      lead: { name: "Ana Paula Vieira Chaveiro", company_name: "ELOS DH" },
      responsavel: "Camila Mattie",
    });
    // Primeiro nome dos dois lados: é assim que se fala no WhatsApp.
    expect(bodyParams).toEqual(["Ana", "Camila"]);
  });

  it("não deixa o parâmetro do SDR vazio quando não há responsável", async () => {
    const { bodyParams } = await resolveTemplateSendParams({
      account: conta,
      storedVariables: ["primeiro_nome", "sdr"],
      lead: { name: "Ana Paula", company_name: null },
      responsavel: null,
    });
    // A Meta rejeita parâmetro vazio; o espaço é o mínimo aceito.
    expect(bodyParams).toEqual(["Ana", " "]);
  });

  it("mantém o template antigo, de uma variável só, funcionando", async () => {
    const { bodyParams } = await resolveTemplateSendParams({
      account: conta,
      storedVariables: ["primeiro_nome"],
      lead: { name: "Luana Cristina", company_name: "ELOS DH" },
    });
    expect(bodyParams).toEqual(["Luana"]);
  });

  it("aceita 'responsavel' como apelido de 'sdr'", async () => {
    const { bodyParams } = await resolveTemplateSendParams({
      account: conta,
      storedVariables: ["responsavel"],
      lead: { name: "Ana", company_name: null },
      responsavel: "Lisiane Souza",
    });
    expect(bodyParams).toEqual(["Lisiane"]);
  });
});
