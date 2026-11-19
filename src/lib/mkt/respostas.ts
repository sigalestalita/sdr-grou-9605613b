/* Mostra no card, de forma legível, o que a pessoa respondeu no formulário do site. */

export type LinhaDeResposta = { rotulo: string; valor: string };
export type EnvioDoFormulario = {
  ativo: string | null;
  em: string | null;
  paginaUrl: string | null;
  aceitaContato: boolean | null;
  respostas: LinhaDeResposta[];
};

/** "qual_seu_desafio" → "Qual seu desafio". Chaves já escritas como frase ficam como estão. */
export function rotuloDaChave(chave: string): string {
  const t = chave.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return chave;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function valorLegivel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.map(valorLegivel).join(", ") || "—";
  if (typeof v === "object") {
    return (
      Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => `${rotuloDaChave(k)}: ${valorLegivel(x)}`)
        .join(" · ") || "—"
    );
  }
  const s = String(v).trim();
  return s || "—";
}

function envio(o: Record<string, unknown>, ativoPadrao: string | null): EnvioDoFormulario | null {
  const r = o.respostas;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  return {
    ativo: typeof o.ativo === "string" ? o.ativo : ativoPadrao,
    em: typeof o.em === "string" ? o.em : null,
    paginaUrl: typeof o.pagina_url === "string" ? o.pagina_url : null,
    aceitaContato: typeof o.aceita_contato === "boolean" ? o.aceita_contato : null,
    respostas: Object.entries(r as Record<string, unknown>).map(([k, v]) => ({
      rotulo: rotuloDaChave(k),
      valor: valorLegivel(v),
    })),
  };
}

/** Os envios do site guardados no card: o primeiro e as reconversões, do mais recente ao mais antigo. */
export function enviosDoFormulario(formPayload: unknown): EnvioDoFormulario[] {
  if (!formPayload || typeof formPayload !== "object") return [];
  const fp = formPayload as Record<string, unknown>;
  const out: EnvioDoFormulario[] = [];
  const primeiro = envio(fp, null);
  if (primeiro) out.push(primeiro);
  if (Array.isArray(fp.reconversoes)) {
    for (const r of fp.reconversoes) {
      if (r && typeof r === "object") {
        const e = envio(r as Record<string, unknown>, null);
        if (e) out.push(e);
      }
    }
  }
  return out.sort((a, b) => (b.em ?? "").localeCompare(a.em ?? ""));
}
