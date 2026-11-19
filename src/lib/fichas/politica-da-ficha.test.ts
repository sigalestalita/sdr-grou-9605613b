import { describe, expect, it } from "vitest";
import {
  completarPolitica,
  emailsDaFicha,
  politicaDaFicha,
  prazoDaFicha,
} from "./politica-da-ficha";

describe("política de faturamento a partir da ficha", () => {
  it("lê os e-mails da NF em qualquer separador", () => {
    expect(emailsDaFicha("Fin@X.com; nf@x.com / fin@x.com")).toEqual(["fin@x.com", "nf@x.com"]);
    expect(emailsDaFicha(null)).toEqual([]);
  });

  it("entende o prazo escrito pelo cliente", () => {
    expect(prazoDaFicha("30 dias")).toEqual({ prazo_tipo: "dias_apos_emissao", prazo_valor: 30 });
    expect(prazoDaFicha("À vista")).toEqual({ prazo_tipo: "a_vista", prazo_valor: 0 });
    expect(prazoDaFicha("pagamos todo dia 10")).toEqual({
      prazo_tipo: "dia_fixo",
      prazo_valor: 10,
    });
    expect(prazoDaFicha("conforme contrato")).toBeNull();
  });

  it("monta a política com OC, forma, fiscal e observações", () => {
    const p = politicaDaFicha({
      ordem_compra_obrigatoria: "Sim",
      forma_pagamento: "Boleto",
      politica_pagamento: "28 dias",
      regime_tributario: "Lucro Real",
      inscricao_estadual: "123",
      nfe_emails: "nf@cliente.com",
    });
    expect(p).toMatchObject({
      exige_oc: true,
      forma_pagamento: "Boleto",
      prazo_tipo: "dias_apos_emissao",
      prazo_valor: 28,
      regime_tributario: "Lucro Real",
      inscricao_estadual: "123",
      emails_nf: ["nf@cliente.com"],
    });
    expect(p.observacoes).toContain("28 dias");
  });

  it("nunca sobrescreve o que o ADM já definiu", () => {
    const patch = completarPolitica(
      {
        exige_oc: false,
        forma_pagamento: "",
        emails_nf: [],
        prazo_tipo: "a_vista",
        prazo_valor: 0,
      },
      {
        exige_oc: true,
        forma_pagamento: "Pix",
        emails_nf: ["a@b.com"],
        prazo_tipo: "dia_fixo",
        prazo_valor: 5,
      },
    );
    expect(patch).toEqual({ forma_pagamento: "Pix", emails_nf: ["a@b.com"] });
  });

  it("política inexistente recebe tudo", () => {
    expect(completarPolitica(null, { exige_oc: false })).toEqual({ exige_oc: false });
  });
});
