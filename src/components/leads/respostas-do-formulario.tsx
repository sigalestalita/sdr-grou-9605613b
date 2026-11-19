import { enviosDoFormulario } from "@/lib/mkt/respostas";

function quando(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** As respostas que a pessoa deu no formulário do site, uma lista por envio. */
export function RespostasDoFormulario({ formPayload }: { formPayload: unknown }) {
  const envios = enviosDoFormulario(formPayload);
  if (envios.length === 0) return null;
  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="text-sm font-semibold">Respostas do formulário</h3>
      {envios.map((e, i) => (
        <div key={`${e.em ?? "x"}-${i}`} className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {e.ativo && <span className="font-medium text-foreground">{e.ativo}</span>}
            {quando(e.em) && <span>{quando(e.em)}</span>}
            {e.aceitaContato !== null && (
              <span>{e.aceitaContato ? "Aceita contato" : "Não marcou que aceita contato"}</span>
            )}
          </div>
          {e.respostas.length > 0 ? (
            <dl className="grid gap-2 text-sm">
              {e.respostas.map((r, j) => (
                <div key={j}>
                  <dt className="text-xs text-muted-foreground">{r.rotulo}</dt>
                  <dd className="whitespace-pre-wrap break-words">{r.valor}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">Sem respostas além dos dados de contato.</p>
          )}
          {e.paginaUrl && (
            <a
              href={e.paginaUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-primary hover:underline"
            >
              {e.paginaUrl}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
