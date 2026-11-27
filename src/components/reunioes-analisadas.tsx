import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { reunioesAnalisadas, type ReuniaoAnalisada } from "@/lib/reunioes-analisadas.functions";

/*
 * Reuniões analisadas no Sales Coach. Na empresa: todas, de todos os times, com
 * filtro por tipo, contato e pessoa ("quantas reuniões com fulano"). No
 * negócio: só as de venda ligadas a ele. Cada reunião abre com os campos da
 * análise, o resumo e o próximo passo.
 */
const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "—";
const DESTAQUE = /nota|temperatura|ader[eê]ncia|sa[uú]de/i;

const TIPO: Record<ReuniaoAnalisada["tipo"], { label: string; cls: string }> = {
  venda: { label: "Venda", cls: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  atendimento: {
    label: "Atendimento",
    cls: "border-violet-500/40 text-violet-600 dark:text-violet-400",
  },
};

export function useReunioesAnalisadas(filtro: { companyId?: string; dealId?: string }) {
  const fn = useServerFn(reunioesAnalisadas);
  return useQuery({
    queryKey: ["reunioes-analisadas", filtro.companyId ?? null, filtro.dealId ?? null],
    queryFn: () => fn({ data: filtro }),
    staleTime: 60_000,
  });
}

function Reuniao({ r, mostrarNegocio }: { r: ReuniaoAnalisada; mostrarNegocio: boolean }) {
  const destaques = r.campos.filter((c) => DESTAQUE.test(c.rotulo)).slice(0, 3);
  const t = TIPO[r.tipo];
  return (
    <details className="group rounded-md border text-[12px] open:bg-muted/30">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-2 py-1.5 hover:bg-muted/50">
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {r.titulo || (r.contato ? `Reunião com ${r.contato}` : "Reunião")}
          </span>
          <span className="block truncate text-muted-foreground">
            {[dataHora(r.realizadaEm), r.conduzidaPor, r.contato].filter(Boolean).join(" · ")}
          </span>
          {destaques.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {destaques.map((c) => (
                <span key={c.chave} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {c.rotulo}: <span className="font-medium">{c.valor}</span>
                </span>
              ))}
            </span>
          )}
        </span>
        <Badge variant="outline" className={`shrink-0 text-[10px] ${t.cls}`}>
          {t.label}
        </Badge>
      </summary>
      <div className="space-y-2 border-t px-2 py-2">
        {mostrarNegocio && r.negocioId && (
          <p>
            Negócio:{" "}
            <Link
              to="/negocio/$id"
              params={{ id: r.negocioId }}
              className="text-primary hover:underline"
            >
              {r.negocio}
            </Link>
          </p>
        )}
        {r.proximoPasso && (
          <p>
            <span className="font-medium">Próximo passo:</span> {r.proximoPasso}
            {r.proximoPassoEm ? ` (até ${dataHora(r.proximoPassoEm)})` : ""}
          </p>
        )}
        {r.campos.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
            {r.campos.map((c) => (
              <div
                key={c.chave}
                className="flex justify-between gap-2 border-b border-dashed py-0.5"
              >
                <dt className="text-muted-foreground">{c.rotulo}</dt>
                <dd className="text-right">{c.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {r.resumo && (
          <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{r.resumo}</p>
        )}
        {r.link && (
          <a
            href={r.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Abrir a análise no Sales Coach <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </details>
  );
}

const seletor =
  "h-7 rounded-md border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function ReunioesAnalisadas({ companyId, dealId }: { companyId?: string; dealId?: string }) {
  const { data = [], isLoading } = useReunioesAnalisadas({ companyId, dealId });
  const [tipo, setTipo] = useState<"todas" | ReuniaoAnalisada["tipo"]>("todas");
  const [contato, setContato] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [todas, setTodas] = useState(false);

  const contatos = useMemo(
    () =>
      [...new Set(data.map((r) => r.contato).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [data],
  );
  const pessoas = useMemo(
    () => [...new Set(data.map((r) => r.conduzidaPor))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [data],
  );
  const filtradas = data.filter(
    (r) =>
      (tipo === "todas" || r.tipo === tipo) &&
      (!contato || r.contato === contato) &&
      (!pessoa || r.conduzidaPor === pessoa),
  );

  if (isLoading) return <p className="text-[12px] text-muted-foreground">Carregando reuniões…</p>;
  if (data.length === 0)
    return (
      <p className="text-[12px] text-muted-foreground">
        Nenhuma reunião analisada no Sales Coach{dealId ? " neste negócio" : ""}.
      </p>
    );

  const vendas = data.filter((r) => r.tipo === "venda").length;
  const resumo = contato
    ? `${filtradas.length} ${filtradas.length === 1 ? "reunião" : "reuniões"} com ${contato}`
    : `${data.length} ${data.length === 1 ? "reunião" : "reuniões"}` +
      (companyId ? ` · ${vendas} de venda · ${data.length - vendas} de atendimento` : "");
  const visiveis = todas ? filtradas : filtradas.slice(0, 8);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">{resumo}</p>
      {companyId && data.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(["todas", "venda", "atendimento"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                tipo === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "todas" ? "Todas" : TIPO[t].label}
            </button>
          ))}
          {contatos.length > 1 && (
            <select
              aria-label="Filtrar por contato"
              className={seletor}
              value={contato}
              onChange={(e) => setContato(e.target.value)}
            >
              <option value="">Todos os contatos</option>
              {contatos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {pessoas.length > 1 && (
            <select
              aria-label="Filtrar por quem conduziu"
              className={seletor}
              value={pessoa}
              onChange={(e) => setPessoa(e.target.value)}
            >
              <option value="">Todo o time</option>
              {pessoas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        {visiveis.map((r) => (
          <Reuniao key={r.id} r={r} mostrarNegocio={!dealId} />
        ))}
        {filtradas.length === 0 && (
          <p className="text-[12px] text-muted-foreground">Nenhuma reunião com esse filtro.</p>
        )}
      </div>
      {filtradas.length > visiveis.length && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="text-[11px] text-primary hover:underline"
        >
          Ver todas ({filtradas.length})
        </button>
      )}
    </div>
  );
}

/** No negócio: só aparece quando há reunião de venda ligada a ele. */
export function ReunioesDoNegocio({ dealId }: { dealId: string }) {
  const { data = [] } = useReunioesAnalisadas({ dealId });
  if (data.length === 0) return null;
  return (
    <section className="surface-panel p-4">
      <p className="section-label mb-2">Reuniões analisadas (Sales Coach)</p>
      <ReunioesAnalisadas dealId={dealId} />
    </section>
  );
}
