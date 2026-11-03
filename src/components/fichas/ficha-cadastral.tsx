import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck } from "lucide-react";
import { fichasDaEmpresa, type Ficha } from "@/lib/fichas.functions";
import { CAMPOS_FICHA, formatarDocumento } from "@/lib/fichas/normalizar";

/** A ficha cadastral que o cliente preencheu (a mais recente), no negócio e na empresa. */
export function FichaCadastralCard({ companyId }: { companyId: string }) {
  const fn = useServerFn(fichasDaEmpresa);
  const { data } = useQuery({
    queryKey: ["fichas", companyId],
    queryFn: () => fn({ data: { companyId } }),
  });
  const [aberta, setAberta] = useState(false);
  const [i, setI] = useState(0);
  const lista = data ?? [];
  const f = lista[i];
  return (
    <section className="surface-panel space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" /> Ficha cadastral
        </p>
        {lista.length > 1 && (
          <select
            className="h-7 rounded-md border bg-background px-1 text-[11px]"
            value={i}
            onChange={(e) => setI(Number(e.target.value))}
          >
            {lista.map((x, k) => (
              <option key={x.id} value={k}>
                {new Date(x.enviadaEm).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
        )}
      </div>
      {!f ? (
        <p className="text-[12px] text-muted-foreground">
          O cliente ainda não preencheu a ficha (fichacadastral.grougp.com.br).
        </p>
      ) : (
        <>
          <p className="text-[12px] text-muted-foreground">
            Recebida em {new Date(f.enviadaEm).toLocaleDateString("pt-BR")}
            {f.vendedor ? ` · vendedor: ${f.vendedor}` : ""}
            {f.origem === "csv" ? " · histórico (só o resumo)" : ""}
          </p>
          <FichaDados f={f} resumo={!aberta} />
          {Object.keys(f.dados).length > 6 && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => setAberta((v) => !v)}
            >
              {aberta ? "Ver menos" : "Ver ficha completa"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const RESUMO = [
  "forma_pagamento",
  "ordem_compra_obrigatoria",
  "nfe_pessoa",
  "nfe_emails",
  "regime_tributario",
  "politica_pagamento",
];

export function FichaDados({ f, resumo = false }: { f: Ficha; resumo?: boolean }) {
  const campos = CAMPOS_FICHA.filter(
    (c) => f.dados[c.chave] && (!resumo || RESUMO.includes(c.chave)),
  );
  const grupos = new Map<string, typeof campos>();
  for (const c of campos) grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);
  if (!campos.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        {f.tipo} {formatarDocumento(f.documento)} · {f.email ?? "sem e-mail"}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {[...grupos.entries()].map(([g, cs]) => (
        <dl key={g} className="space-y-0.5 text-[12px]">
          {!resumo && (
            <dt className="pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g}
            </dt>
          )}
          {cs.map((c) => (
            <div key={c.chave} className="flex justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">{c.rotulo}</span>
              <span className="whitespace-pre-line text-right">
                {c.chave === "cnpj" || c.chave === "cpf"
                  ? formatarDocumento(f.documento)
                  : f.dados[c.chave]}
              </span>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}
