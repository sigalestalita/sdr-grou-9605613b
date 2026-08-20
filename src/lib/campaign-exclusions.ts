/** Utilitários para exclusão manual de leads em campanhas (por nome ou telefone). */

export type CampaignExclusions = {
  phones?: string[];
  names?: string[];
};

export function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D+/g, "").replace(/^0+/, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

function normName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Divide o texto colado pelo usuário em entradas (uma por linha ou separadas por ; / ,). */
export function parseExclusionText(text: string): CampaignExclusions {
  const parts = text
    .split(/[\n;,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const phones: string[] = [];
  const names: string[] = [];
  for (const p of parts) {
    const digits = p.replace(/\D+/g, "");
    if (digits.length >= 8 && digits.length >= p.replace(/\s/g, "").length - 4) {
      phones.push(normalizePhoneDigits(p));
    } else {
      names.push(p);
    }
  }
  return {
    phones: [...new Set(phones)],
    names: [...new Set(names)],
  };
}

export function exclusionsToText(ex?: CampaignExclusions | null): string {
  if (!ex) return "";
  return [...(ex.names ?? []), ...(ex.phones ?? [])].join("\n");
}

export function countExclusions(ex?: CampaignExclusions | null): number {
  return (ex?.names?.length ?? 0) + (ex?.phones?.length ?? 0);
}

/**
 * Retorna true quando o alvo deve ser EXCLUÍDO do disparo.
 * Telefone: compara os últimos 8 dígitos. Nome: match por igualdade ou "contém".
 */
export function makeExclusionMatcher(ex?: CampaignExclusions | null) {
  const phoneTails = new Set(
    (ex?.phones ?? []).map((p) => normalizePhoneDigits(p).slice(-8)).filter((p) => p.length >= 8),
  );
  const nameTerms = (ex?.names ?? []).map(normName).filter((n) => n.length >= 3);

  return function isExcluded(target: { name?: string | null; company_name?: string | null; phone?: string | null }) {
    if (phoneTails.size) {
      const tail = normalizePhoneDigits(target.phone ?? "").slice(-8);
      if (tail.length >= 8 && phoneTails.has(tail)) return true;
    }
    if (nameTerms.length) {
      const hay = `${normName(target.name ?? "")} | ${normName(target.company_name ?? "")}`;
      if (nameTerms.some((t) => hay.includes(t))) return true;
    }
    return false;
  };
}