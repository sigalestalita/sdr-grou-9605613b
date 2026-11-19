import type { Politica, PrazoTipo } from "@/lib/faturamento/politica";

/*
 * A política de faturamento nasce da ficha cadastral (pedido da reunião do
 * financeiro de 18/11): o cliente já informa OC obrigatória, forma de
 * pagamento, e-mails da NF, regime e inscrições. O ADM só confere e ajusta.
 *
 * Regra: a ficha só preenche o que está vazio na política. O que o ADM já
 * definiu nunca é sobrescrito por uma ficha reenviada.
 */

type CamposDaFicha = Pick<
  Politica,
  | "exige_oc"
  | "forma_pagamento"
  | "prazo_tipo"
  | "prazo_valor"
  | "regime_tributario"
  | "inscricao_estadual"
  | "inscricao_municipal"
  | "emails_nf"
  | "observacoes"
>;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** "a@x.com; b@y.com / c@z.com" → lista sem repetição, em minúsculas. */
export function emailsDaFicha(texto: string | null | undefined): string[] {
  const achados = (texto ?? "").match(EMAIL) ?? [];
  return [...new Set(achados.map((e) => e.toLowerCase()))].slice(0, 10);
}

/** "30 dias", "30/60/90", "à vista", "todo dia 10" → prazo da política. */
export function prazoDaFicha(
  texto: string | null | undefined,
): { prazo_tipo: PrazoTipo; prazo_valor: number | null } | null {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t.trim()) return null;
  if (/\ba vista\b|\bantecipad/.test(t)) return { prazo_tipo: "a_vista", prazo_valor: 0 };
  const diaFixo = t.match(/\bdia\s+(\d{1,2})\b/);
  if (diaFixo && Number(diaFixo[1]) >= 1 && Number(diaFixo[1]) <= 31)
    return { prazo_tipo: "dia_fixo", prazo_valor: Number(diaFixo[1]) };
  const dias = t.match(/(\d{1,3})\s*(dias|dd|d\b)/) ?? t.match(/^\s*(\d{1,3})\s*$/);
  if (dias && Number(dias[1]) <= 365)
    return { prazo_tipo: "dias_apos_emissao", prazo_valor: Number(dias[1]) };
  return null;
}

/** O que a ficha diz sobre a política (só os campos que ela traz). */
export function politicaDaFicha(dados: Record<string, string>): Partial<CamposDaFicha> {
  const p: Partial<CamposDaFicha> = {};
  const oc = (dados.ordem_compra_obrigatoria ?? "").toLowerCase();
  if (oc === "sim") p.exige_oc = true;
  else if (oc === "não" || oc === "nao") p.exige_oc = false;
  if (dados.forma_pagamento) p.forma_pagamento = dados.forma_pagamento.slice(0, 60);
  const prazo = prazoDaFicha(dados.politica_pagamento);
  if (prazo) Object.assign(p, prazo);
  if (dados.regime_tributario) p.regime_tributario = dados.regime_tributario.slice(0, 60);
  if (dados.inscricao_estadual) p.inscricao_estadual = dados.inscricao_estadual.slice(0, 30);
  if (dados.inscricao_municipal) p.inscricao_municipal = dados.inscricao_municipal.slice(0, 30);
  const emails = emailsDaFicha(dados.nfe_emails);
  if (emails.length) p.emails_nf = emails;
  const obs = [
    dados.politica_pagamento ? `Política de pagamento (ficha): ${dados.politica_pagamento}` : null,
    dados.observacoes ? `Observações (ficha): ${dados.observacoes}` : null,
  ].filter(Boolean);
  if (obs.length) p.observacoes = obs.join("\n").slice(0, 2000);
  return p;
}

/**
 * Junta a ficha à política atual: só entra o que está vazio (null, "" ou
 * lista vazia). Devolve só os campos que mudam — vazio = nada a fazer.
 */
export function completarPolitica(
  atual: Partial<Record<keyof CamposDaFicha, unknown>> | null,
  daFicha: Partial<CamposDaFicha>,
): Partial<CamposDaFicha> {
  const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  const patch: Record<string, unknown> = {};
  // O prazo é um par: só entra se os dois estiverem vazios.
  const prazoVazio = vazio(atual?.prazo_tipo) && vazio(atual?.prazo_valor);
  for (const [k, v] of Object.entries(daFicha)) {
    if (k === "prazo_tipo" || k === "prazo_valor") {
      if (prazoVazio) patch[k] = v;
      continue;
    }
    if (vazio(atual?.[k as keyof CamposDaFicha])) patch[k] = v;
  }
  return patch as Partial<CamposDaFicha>;
}
