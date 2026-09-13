import { describe, expect, it } from "vitest";
import {
  assinaturaDaIa,
  decidirAtendimento,
  funcionariosMinimos,
  porteDoLead,
  REGRAS_PADRAO,
  type LeadParaIa,
} from "./ai-elegibilidade";

const lead = (p: Partial<LeadParaIa>): LeadParaIa => ({
  lead_type: "empresa",
  company_size: null,
  linkedin_company_size: null,
  assigned_to: null,
  ...p,
});

describe("funcionariosMinimos", () => {
  it("lê as faixas nos formatos que chegam do RD e do LinkedIn", () => {
    expect(funcionariosMinimos("11-50")).toBe(11);
    expect(funcionariosMinimos("51 - 100")).toBe(51);
    expect(funcionariosMinimos("101-250")).toBe(101);
    expect(funcionariosMinimos("2.001 - 5.000")).toBe(2001);
    expect(funcionariosMinimos("10.001+")).toBe(10001);
    expect(funcionariosMinimos("180")).toBe(180);
  });

  it("devolve null quando não dá para ler", () => {
    expect(funcionariosMinimos(null)).toBeNull();
    expect(funcionariosMinimos("")).toBeNull();
    expect(funcionariosMinimos("não informado")).toBeNull();
  });

  it("prefere o dado do LinkedIn quando existe", () => {
    expect(porteDoLead({ company_size: "11-50", linkedin_company_size: "201-500" })).toBe(201);
    expect(porteDoLead({ company_size: "11-50", linkedin_company_size: null })).toBe(11);
  });
});

describe("decidirAtendimento — empresa", () => {
  it("atende empresa pequena", () => {
    const d = decidirAtendimento(lead({ company_size: "11-50" }));
    expect(d.atende).toBe(true);
    expect(d.handoff).toBe("sdr_responsavel");
  });

  it("recusa empresa no corte ou acima", () => {
    expect(decidirAtendimento(lead({ company_size: "101-250" })).atende).toBe(false);
    expect(decidirAtendimento(lead({ company_size: "100" })).atende).toBe(false);
  });

  it("a faixa 51-100 ainda entra, porque o piso é 51", () => {
    expect(decidirAtendimento(lead({ company_size: "51 - 100" })).atende).toBe(true);
  });

  it("sem porte informado, atende e qualifica", () => {
    const d = decidirAtendimento(lead({}));
    expect(d.atende).toBe(true);
    expect(d.motivo).toContain("não informado");
  });

  it("respeita um corte diferente do padrão", () => {
    const regras = { ...REGRAS_PADRAO, empresaMaxFuncionarios: 50 };
    expect(decidirAtendimento(lead({ company_size: "51 - 100" }), regras).atende).toBe(false);
  });

  it("pessoa física segue a mesma régua da empresa", () => {
    const d = decidirAtendimento(lead({ lead_type: "pessoa_fisica", company_size: "201-500" }));
    expect(d.atende).toBe(false);
  });
});

describe("decidirAtendimento — consultoria", () => {
  it("atende 100%, mesmo com porte grande", () => {
    const d = decidirAtendimento(
      lead({ lead_type: "consultoria", linkedin_company_size: "5.001 - 10.000" }),
    );
    expect(d.atende).toBe(true);
    expect(d.handoff).toBe("consultoria");
  });

  it("o bastão de consultoria não vai para o SDR do lead", () => {
    expect(decidirAtendimento(lead({ lead_type: "consultoria" })).handoff).toBe("consultoria");
  });

  it("dá para desligar o atendimento de consultoria", () => {
    const regras = { ...REGRAS_PADRAO, consultoriaAtendeTudo: false };
    expect(decidirAtendimento(lead({ lead_type: "consultoria" }), regras).atende).toBe(false);
  });
});

describe("assinaturaDaIa", () => {
  it("usa o primeiro nome do responsável", () => {
    expect(assinaturaDaIa("Lisiane Baudini", "Equipe Grou")).toBe("Lisiane");
    expect(assinaturaDaIa("Camila Mattie", "Equipe Grou")).toBe("Camila");
  });

  it("cai no nome configurado quando não há responsável", () => {
    expect(assinaturaDaIa(null, "Equipe Grou")).toBe("Equipe");
    expect(assinaturaDaIa("   ", "Mariana Borges")).toBe("Mariana");
  });

  it("nunca devolve vazio", () => {
    expect(assinaturaDaIa(null, "")).toBe("equipe Grou");
  });
});
