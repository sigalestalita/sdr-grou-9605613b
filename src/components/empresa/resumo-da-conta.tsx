import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gerarResumoDaConta, resumoDaConta } from "@/lib/resumo-conta.functions";
import { TIMES, type Cartao, type Time } from "@/lib/empresa/resumo-por-time";
import { COR_DO_TIME, NOME_DO_TIME } from "@/components/empresa/cores-dos-times";

/*
 * Resumo da conta por time, no topo da ficha da empresa, para todos os times:
 * um resumo em texto (IA, a partir dos fatos), um cartão por time e a linha do
 * tempo única com filtro. Clicar num cartão filtra a linha do tempo.
 */
const haQuanto = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

export function ResumoDaConta({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(resumoDaConta);
  const gerarFn = useServerFn(gerarResumoDaConta);
  const [filtro, setFiltro] = useState<Time | "todos">("todos");
  const [mostrar, setMostrar] = useState(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ["resumo-da-conta", companyId],
    queryFn: () => fn({ data: { companyId } }),
    staleTime: 60_000,
  });
  const gerar = useMutation({
    mutationFn: () => gerarFn({ data: { companyId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumo-da-conta", companyId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar o resumo"),
  });

  if (isLoading)
    return (
      <section className="surface-panel p-4 text-[13px] text-muted-foreground">
        Montando o resumo da conta…
      </section>
    );
  if (error || !data)
    return (
      <section className="surface-panel p-4 text-[13px] text-destructive">
        {error instanceof Error ? error.message : "Não foi possível montar o resumo da conta."}
      </section>
    );

  const eventos = data.eventos.filter((e) => filtro === "todos" || e.time === filtro);
  const agora = Date.now();

  return (
    <section className="surface-panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="section-label">Resumo da conta</h2>
          <p className="text-[12px] text-muted-foreground">
            O que cada time fez com {data.empresa}. Clique num time para ver só o que é dele.
          </p>
        </div>
      </div>

      {/* Resumo em texto (IA) */}
      <div className="rounded-lg border bg-muted/30 p-3">
        {data.ia ? (
          <>
            <p className="whitespace-pre-line text-[13px] leading-relaxed">{data.ia.texto}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>
                Gerado por IA a partir dos dados abaixo {haQuanto(data.ia.geradoEm)}
                {data.ia.geradoPor ? ` (pedido por ${data.ia.geradoPor})` : ""}.
                {data.ia.desatualizado && " Houve novidades depois disso."}
              </span>
              <Button
                size="sm"
                variant={data.ia.desatualizado ? "default" : "ghost"}
                className="h-6 px-2 text-[11px]"
                disabled={gerar.isPending}
                onClick={() => gerar.mutate()}
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${gerar.isPending ? "animate-spin" : ""}`} />
                {gerar.isPending ? "Gerando…" : "Atualizar"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Sem resumo em texto ainda.</span>
            <Button
              size="sm"
              className="h-7 text-[12px]"
              disabled={gerar.isPending}
              onClick={() => gerar.mutate()}
            >
              {gerar.isPending ? "Gerando…" : "Gerar resumo com IA"}
            </Button>
          </div>
        )}
      </div>

      {/* Um cartão por time */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.cartoes.map((c) => (
          <CartaoDoTime
            key={c.time}
            c={c as Cartao}
            ativo={filtro === c.time}
            agora={agora}
            onClick={() => {
              setFiltro(filtro === c.time ? "todos" : (c.time as Time));
              setMostrar(30);
            }}
          />
        ))}
      </div>

      {/* Linha do tempo */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <h3 className="mr-1 text-[12px] font-semibold">Linha do tempo</h3>
          {(["todos", ...TIMES.map((t) => t.id)] as Array<Time | "todos">).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setFiltro(t);
                setMostrar(30);
              }}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                filtro === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : t === "todos"
                    ? "text-muted-foreground"
                    : COR_DO_TIME[t].chip
              }`}
            >
              {t === "todos" ? "Todos" : NOME_DO_TIME[t]}
            </button>
          ))}
        </div>
        {eventos.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Nada registrado.</p>
        ) : (
          <ul className="divide-y">
            {eventos.slice(0, mostrar).map((e, i) => {
              const futuro = Date.parse(e.quando) > agora;
              const conteudo = (
                <>
                  <span className="w-16 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {dataCurta(e.quando)}
                  </span>
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${COR_DO_TIME[e.time as Time].ponto}`}
                    title={NOME_DO_TIME[e.time as Time]}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{e.titulo}</span>
                    {futuro && <span className="ml-1 text-[11px] text-primary">(agendado)</span>}
                    {e.detalhe && (
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {e.detalhe}
                      </span>
                    )}
                  </span>
                  {e.quem && (
                    <span className="max-w-[140px] shrink-0 truncate text-[11px] text-muted-foreground">
                      {e.quem}
                    </span>
                  )}
                </>
              );
              return (
                <li key={`${e.quando}-${i}`} className="text-[13px]">
                  {e.link ? (
                    <Link
                      to={e.link as never}
                      className="flex items-start gap-2 py-1.5 hover:bg-muted/40"
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-2 py-1.5">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {eventos.length > mostrar && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 text-[12px]"
            onClick={() => setMostrar((m) => m + 50)}
          >
            Ver mais ({eventos.length - mostrar})
          </Button>
        )}
      </div>
    </section>
  );
}

function CartaoDoTime({
  c,
  ativo,
  agora,
  onClick,
}: {
  c: Cartao;
  ativo: boolean;
  agora: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${
        ativo ? "border-primary ring-1 ring-primary" : ""
      } ${c.vazio && !c.ultima ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${COR_DO_TIME[c.time].ponto}`} />
        <span className="text-[13px] font-semibold">{c.nome}</span>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        {c.responsaveis.length ? c.responsaveis.slice(0, 3).join(", ") : "Ninguém registrado"}
        {c.responsaveis.length > 3 ? ` +${c.responsaveis.length - 3}` : ""}
      </p>
      {c.ultima && Date.parse(c.ultima.quando) <= agora ? (
        <div className="text-[12px]">
          <p className="line-clamp-2">{c.ultima.titulo}</p>
          <p className="text-[11px] text-muted-foreground">
            {haQuanto(c.ultima.quando)}
            {c.ultima.quem ? ` · ${c.ultima.quem}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">Nada registrado ainda.</p>
      )}
      <dl className="mt-auto grid gap-0.5">
        {c.numeros.map((n) => (
          <div key={n.rotulo} className="flex justify-between gap-2 text-[11px]">
            <dt className="text-muted-foreground">{n.rotulo}</dt>
            <dd className="truncate text-right font-medium">{n.valor}</dd>
          </div>
        ))}
      </dl>
      {c.alertas.length > 0 && (
        <ul className="space-y-0.5">
          {c.alertas.map((a) => (
            <li
              key={a}
              className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
