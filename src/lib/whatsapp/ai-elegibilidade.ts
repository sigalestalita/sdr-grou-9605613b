/*
 * Quem a IA atende, e para quem ela passa o bastão.
 *
 * Regras vindas da gestão:
 *  - Lead EMPRESA: a IA só atende abaixo de um porte (padrão, menos de 100
 *    funcionários). Empresa maior vai direto para o SDR responsável, porque o
 *    atendimento precisa ser humano desde o começo.
 *  - Lead CONSULTORIA: a IA atende 100%, sem olhar porte. Quando aparecer
 *    intenção de agenda comercial ou pedido de atendimento humano, o bastão
 *    vai para a pessoa que cuida de consultoria.
 *  - Pessoa física segue a regra geral de empresa pequena.
 *
 * A IA também assina com o nome do SDR responsável pelo lead, nunca com um
 * nome fixo.
 */

export type LeadParaIa = {
  lead_type: string | null;
  company_size: string | null;
  linkedin_company_size: string | null;
  assigned_to: string | null;
  /**
   * Já é cliente Grou.
   *
   * As condições da Black September que a IA conhece são só de quem ainda não
   * é cliente. Cliente tem renovação, recarga e preço por crédito — e quem
   * cuida disso é o CS e o executivo de carteira. A IA oferecendo renovação
   * atropelaria esse atendimento e daria desconto que não é dela para dar.
   */
  ja_e_cliente?: boolean;
};

export type RegrasIa = {
  /** Acima disso, empresa não é atendida pela IA. */
  empresaMaxFuncionarios: number;
  /** Consultoria é sempre atendida, independente do porte. */
  consultoriaAtendeTudo: boolean;
};

export const REGRAS_PADRAO: RegrasIa = {
  empresaMaxFuncionarios: 100,
  consultoriaAtendeTudo: true,
};

/**
 * Menor número de funcionários que a faixa representa.
 *
 * As faixas chegam do RD e do LinkedIn em formatos diferentes: "11-50",
 * "51 - 100", "2.001 - 5.000", "10.001+". Usar o piso da faixa deixa a regra
 * previsível: "101-250" já é grande, "51-100" ainda entra.
 */
export function funcionariosMinimos(faixa: string | null | undefined): number | null {
  if (!faixa) return null;
  const limpo = faixa.replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  const numeros = limpo.match(/\d+/g);
  if (!numeros || numeros.length === 0) return null;
  return Number(numeros[0]);
}

/** O porte do lead, olhando primeiro o dado do LinkedIn, que costuma ser melhor. */
export function porteDoLead(lead: Pick<LeadParaIa, "company_size" | "linkedin_company_size">) {
  return funcionariosMinimos(lead.linkedin_company_size) ?? funcionariosMinimos(lead.company_size);
}

export type DecisaoIa = {
  atende: boolean;
  motivo: string;
  /** Para quem vai o bastão quando a conversa amadurecer. */
  handoff: "consultoria" | "sdr_responsavel";
};

/** A IA deve atender este lead? */
export function decidirAtendimento(lead: LeadParaIa, regras: RegrasIa = REGRAS_PADRAO): DecisaoIa {
  if (lead.ja_e_cliente) {
    return {
      atende: false,
      motivo:
        "Já é cliente Grou: as condições que a IA conhece são de quem ainda não é cliente. Renovação, recarga e preço por crédito são do CS e do executivo de carteira.",
      handoff: lead.lead_type === "consultoria" ? "consultoria" : "sdr_responsavel",
    };
  }

  if (lead.lead_type === "consultoria") {
    return regras.consultoriaAtendeTudo
      ? {
          atende: true,
          motivo: "Consultoria é atendida integralmente pela IA, sem corte de porte.",
          handoff: "consultoria",
        }
      : {
          atende: false,
          motivo: "Atendimento de consultoria pela IA está desligado.",
          handoff: "consultoria",
        };
  }

  const porte = porteDoLead(lead);
  if (porte !== null && porte >= regras.empresaMaxFuncionarios) {
    return {
      atende: false,
      motivo: `Empresa com ${porte} ou mais funcionários: acima do corte de ${regras.empresaMaxFuncionarios}, o atendimento é humano desde o início.`,
      handoff: "sdr_responsavel",
    };
  }

  return {
    atende: true,
    motivo:
      porte !== null
        ? `Empresa abaixo de ${regras.empresaMaxFuncionarios} funcionários.`
        : "Porte não informado: a IA faz o primeiro atendimento e qualifica.",
    handoff: "sdr_responsavel",
  };
}

/**
 * Nome com que a IA assina. É o do SDR responsável pelo lead; sem responsável,
 * cai no nome configurado pela operação.
 */
export function assinaturaDaIa(
  nomeDoResponsavel: string | null | undefined,
  fallback: string,
): string {
  const nome = (nomeDoResponsavel ?? "").trim();
  // Só o primeiro nome: é assim que se apresenta no WhatsApp.
  if (nome) return nome.split(/\s+/)[0];
  return fallback.trim().split(/\s+/)[0] || "equipe Grou";
}
