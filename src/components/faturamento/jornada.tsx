import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Plus, Trash2 } from "lucide-react";
import { getJornadaDoNegocio, salvarRateio } from "@/lib/jornada-faturamento.functions";
import { formatarCnpj } from "@/lib/faturamento/politica";
import { moeda } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dataBr = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : "";

export function useJornada(dealId: string) {
  const fn = useServerFn(getJornadaDoNegocio);
  return useQuery({
    queryKey: ["faturamento", "jornada", dealId],
    queryFn: () => fn({ data: { dealId } }),
  });
}

type Negocio = Record<string, string | number | boolean | null>;
type Etapa = { nome: string; detalhe: string; estado: "feito" | "atual" | "alerta" | "falta" };

/** Ganho → ficha/política → conferência → nota → recebimento. */
export function JornadaEtapas({ negocio: n, dealId }: { negocio: Negocio; dealId: string }) {
  const { data: j } = useJornada(dealId);
  if (!j) return null;
  const nf = String(n.ca_nf_status ?? "");
  const faturado = !!n.faturado_em || nf === "EMITIDA" || nf === "PARCIAL";
  const etapas: Etapa[] = [
    { nome: "Ganho", detalhe: dataBr(String(n.closed_at ?? "")), estado: "feito" },
    j.ficha
      ? {
          nome: j.ficha.confirmadaEm ? "Ficha confirmada" : "Ficha a confirmar",
          detalhe: `recebida ${dataBr(j.ficha.enviadaEm)}`,
          estado: j.ficha.confirmadaEm ? "feito" : "alerta",
        }
      : {
          nome: j.temPolitica ? "Política existente" : "Sem ficha",
          detalhe: j.temPolitica ? "já cliente" : "peça a ficha ao cliente",
          estado: j.temPolitica ? "feito" : "alerta",
        },
    n.adm_pendencia && !n.adm_checked_at
      ? { nome: "Pendência do ADM", detalhe: "responda abaixo", estado: "alerta" }
      : {
          nome: "Conferido pelo ADM",
          detalhe: n.adm_checked_at ? dataBr(String(n.adm_checked_at)) : "aguardando",
          estado: n.adm_checked_at || faturado ? "feito" : "atual",
        },
    nf === "FALHA"
      ? { nome: "Nota com problema", detalhe: "o ADM foi avisado", estado: "alerta" }
      : nf === "PARCIAL"
        ? {
            nome: "Faturado em parte",
            detalhe: `${moeda(Number(n.ca_valor_faturado ?? 0))} de ${moeda(Number(n.amount ?? 0))}`,
            estado: "atual",
          }
        : nf === "EM_EMISSAO"
          ? { nome: "Nota em emissão", detalhe: "na Conta Azul", estado: "atual" }
          : {
              nome: "Faturado",
              detalhe: faturado
                ? `${dataBr(String(n.faturado_em ?? ""))}${n.ca_nf_numeros ? ` · NF ${String(n.ca_nf_numeros)}` : ""}`
                : "aguardando a nota",
              estado: faturado ? "feito" : "falta",
            },
    !faturado
      ? { nome: "Recebido", detalhe: "", estado: "falta" }
      : j.recebimento.vencidas > 0
        ? {
            nome: "Em atraso",
            detalhe: `${j.recebimento.vencidas} parcela(s) vencida(s)`,
            estado: "alerta",
          }
        : j.recebimento.abertas > 0
          ? {
              nome: "A receber",
              detalhe: `${j.recebimento.abertas} parcela(s) · ${moeda(j.recebimento.valorAberto)}`,
              estado: "atual",
            }
          : { nome: "Recebido", detalhe: "sem parcelas em aberto", estado: "feito" },
  ];
  const cor: Record<Etapa["estado"], string> = {
    feito: "bg-emerald-500",
    atual: "bg-amber-400",
    alerta: "bg-destructive",
    falta: "bg-muted",
  };
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Etapas do faturamento">
      {etapas.map((e) => (
        <li key={e.nome} className="space-y-1">
          <span className={`block h-1.5 rounded-full ${cor[e.estado]}`} />
          <p
            className={`text-[12px] font-medium ${e.estado === "falta" ? "text-muted-foreground" : ""} ${e.estado === "alerta" ? "text-destructive" : ""}`}
          >
            {e.nome}
          </p>
          {e.detalhe && <p className="text-[11px] text-muted-foreground">{e.detalhe}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Notas já emitidas para a empresa (Compass e Conta Azul). */
export function NotasDaEmpresa({ dealId }: { dealId: string }) {
  const { data: j } = useJornada(dealId);
  const notas = j?.notasDaEmpresa ?? [];
  if (!notas.length) return null;
  return (
    <div className="space-y-1 border-t pt-2 text-[12px]">
      <p className="font-medium">Notas da empresa</p>
      <ul className="space-y-0.5">
        {notas.slice(0, 8).map((n, i) => (
          <li key={`${n.numero}-${i}`} className="flex justify-between gap-2">
            <span>
              NF {n.numero ?? "—"} · {dataBr(n.emitidaEm)}
              {n.status && !/^(EMITIDA|emitida)$/.test(n.status)
                ? ` · ${n.status.toLowerCase()}`
                : ""}
            </span>
            <span className="text-muted-foreground">{n.valor == null ? "" : moeda(n.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROTULO_NF: Record<string, string> = {
  EMITIDA: "faturado",
  PARCIAL: "faturado em parte",
  EM_EMISSAO: "nota em emissão",
  FALHA: "nota com problema",
  CANCELADA: "nota cancelada",
  SEM_NOTA: "sem nota",
};

/**
 * Rateio por CNPJ: um negócio (um valor vendido) faturado em vários CNPJs da
 * mesma conta-mãe. Cada linha vira uma venda/nota na Conta Azul.
 */
export function RateioCnpjs({ dealId, valorVendido }: { dealId: string; valorVendido: number }) {
  const qc = useQueryClient();
  const { data: j } = useJornada(dealId);
  const salvarFn = useServerFn(salvarRateio);
  const [editando, setEditando] = useState(false);
  const [linhas, setLinhas] = useState<Array<{ cnpj: string; valor: string; nome: string }>>([]);
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          dealId,
          linhas: linhas
            .filter((l) => l.cnpj.trim())
            .map((l) => ({
              cnpj: l.cnpj,
              valor: Number(l.valor.replace(",", ".")) || 0,
              nome: l.nome || undefined,
            })),
        },
      }),
    onSuccess: (r) => {
      toast.success(r.linhas ? `Rateio salvo em ${r.linhas} CNPJs` : "Rateio removido");
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["faturamento"] });
      qc.invalidateQueries({ queryKey: ["conta-azul-negocio", dealId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  if (!j) return null;
  const rateio = j.rateio;
  if (!rateio.length && !j.podeEditarRateio) return null;

  const abrir = () => {
    setLinhas(
      rateio.length
        ? rateio.map((l) => ({ cnpj: formatarCnpj(l.cnpj), valor: String(l.valor), nome: "" }))
        : [{ cnpj: "", valor: String(valorVendido || ""), nome: "" }],
    );
    setEditando(true);
  };
  const soma = linhas.reduce((s, l) => s + (Number(l.valor.replace(",", ".")) || 0), 0);
  const nomePorCnpj = new Map(j.familia.filter((e) => e.cnpj).map((e) => [e.cnpj!, e.nome]));

  return (
    <section className="surface-panel space-y-2 p-4 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label flex items-center gap-1">
          <Building2 className="h-3.5 w-3.5" /> Faturamento por CNPJ
        </h2>
        {j.podeEditarRateio && !editando && (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={abrir}
          >
            {rateio.length ? "Editar rateio" : "Faturar em vários CNPJs"}
          </button>
        )}
      </div>

      {!editando && rateio.length === 0 && (
        <p className="text-[12px] text-muted-foreground">
          Fatura num CNPJ só. Se o cliente pediu notas para filiais da mesma conta-mãe
          {j.contaMae ? ` (${j.contaMae.nome})` : ""}, divida aqui — continua sendo um negócio só.
        </p>
      )}

      {!editando && rateio.length > 0 && (
        <ul className="space-y-1.5">
          {rateio.map((l) => (
            <li key={l.id} className="rounded border px-2 py-1.5 text-[12px]">
              <p className="flex justify-between gap-2">
                <span className="font-medium">{l.empresa ?? formatarCnpj(l.cnpj)}</span>
                <span>{moeda(l.valor)}</span>
              </p>
              <p className="flex flex-wrap justify-between gap-2 text-muted-foreground">
                <span>{formatarCnpj(l.cnpj)}</span>
                <span>
                  {l.caVendaNumero ? `venda ${l.caVendaNumero} · ` : ""}
                  {ROTULO_NF[l.caNfStatus ?? ""] ?? "aguardando venda na Conta Azul"}
                  {l.caNfNumeros ? ` · NF ${l.caNfNumeros}` : ""}
                </span>
              </p>
            </li>
          ))}
          <li className="flex justify-between text-[12px] text-muted-foreground">
            <span>Faturado</span>
            <span>
              {moeda(rateio.reduce((s, l) => s + (l.caValorFaturado ?? 0), 0))} de{" "}
              {moeda(rateio.reduce((s, l) => s + l.valor, 0))}
            </span>
          </li>
        </ul>
      )}

      {editando && (
        <div className="space-y-2">
          {linhas.map((l, i) => {
            const conhecido = nomePorCnpj.get(l.cnpj.replace(/\D/g, ""));
            return (
              <div key={i} className="space-y-1 rounded border p-2">
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor={`rateio-cnpj-${i}`}>
                    CNPJ
                  </label>
                  <Input
                    id={`rateio-cnpj-${i}`}
                    className="h-8 min-w-[170px] flex-1"
                    placeholder="CNPJ"
                    list={`rateio-familia-${dealId}`}
                    value={l.cnpj}
                    onChange={(e) =>
                      setLinhas(
                        linhas.map((x, k) => (k === i ? { ...x, cnpj: e.target.value } : x)),
                      )
                    }
                  />
                  <label className="sr-only" htmlFor={`rateio-valor-${i}`}>
                    Valor
                  </label>
                  <Input
                    id={`rateio-valor-${i}`}
                    className="h-8 w-[130px]"
                    inputMode="decimal"
                    placeholder="Valor"
                    value={l.valor}
                    onChange={(e) =>
                      setLinhas(
                        linhas.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    aria-label="Tirar este CNPJ"
                    onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {conhecido ? (
                  <p className="text-[11px] text-muted-foreground">{conhecido}</p>
                ) : l.cnpj.replace(/\D/g, "").length === 14 ? (
                  <Input
                    className="h-8"
                    placeholder="Nome da unidade (vira empresa filha da conta-mãe)"
                    value={l.nome}
                    onChange={(e) =>
                      setLinhas(
                        linhas.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)),
                      )
                    }
                  />
                ) : null}
              </div>
            );
          })}
          <datalist id={`rateio-familia-${dealId}`}>
            {j.familia
              .filter((e) => e.cnpj)
              .map((e) => (
                <option key={e.id} value={formatarCnpj(e.cnpj)}>
                  {e.nome}
                </option>
              ))}
          </datalist>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinhas([...linhas, { cnpj: "", valor: "", nome: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar CNPJ
          </Button>
          <p
            className={`text-[12px] ${Math.abs(soma - valorVendido) > 0.01 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
          >
            Soma {moeda(soma)} · vendido {moeda(valorVendido)}
            {Math.abs(soma - valorVendido) > 0.01 ? " — a soma não bate com o valor vendido" : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              Salvar rateio
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
