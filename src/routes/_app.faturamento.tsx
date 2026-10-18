import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Download, ExternalLink, Receipt } from "lucide-react";
import {
  cancelarFatura,
  conferirNegocio,
  devolverAoComercial,
  getFaturamentoNegocio,
  listarFilaFaturamento,
  registrarFatura,
  registrarRecebimento,
  relatorioFaturamento,
  type EtapaFila,
} from "@/lib/faturamento.functions";
import { listarLicencas, mudarStatusLicenca } from "@/lib/requerimentos.functions";
import { PRAZO_PDA_DIAS_UTEIS } from "@/lib/requerimentos/regras";
import {
  atualizarContrato,
  listarContratos,
  STATUS_CONTRATO,
} from "@/lib/contratos-turmas.functions";
import { relatorioSegmentado } from "@/lib/relatorios.functions";
import { DIMENSOES, type Dimensao } from "@/lib/relatorios/segmentos";
import {
  calcularRetencoes,
  formatarCnpj,
  gerarParcelas,
  primeiroVencimento,
  proximaEmissao,
  type Parcela,
} from "@/lib/faturamento/politica";
import { moeda } from "@/lib/comercial/metas";
import { hojeSP } from "@/lib/datas-sp";
import { downloadCsv } from "@/lib/export-csv";
import { PoliticaFaturamentoCard } from "@/components/faturamento/politica-card";
import { dataBr } from "@/components/faturamento/faturamento-do-negocio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/faturamento")({
  component: FaturamentoPage,
  head: () => ({ meta: [{ title: "Faturamento | Grou Compass" }] }),
});

const ETAPAS: Array<{ v: EtapaFila; l: string; dica: string }> = [
  { v: "a_conferir", l: "A conferir", dica: "Ganhos que chegaram do comercial" },
  { v: "pendencia", l: "Com o comercial", dica: "Devolvidos por falta de informação" },
  { v: "a_faturar", l: "A faturar", dica: "Conferidos, aguardando a nota" },
  { v: "a_receber", l: "A receber", dica: "Nota emitida, parcelas em aberto" },
  { v: "recebido", l: "Recebido", dica: "Últimos 120 dias" },
];

const hojeIso = () => hojeSP();

/**
 * O módulo da Fabiana. Antes: o ganho chegava por e-mail, a nota saía fora do
 * CRM e o faturamento real era uma lista que a Lauren montava à mão. Aqui o
 * ADM confere o que o comercial entregou, devolve o que falta, registra a nota
 * com as parcelas e acompanha o recebimento — e o relatório do mês sai pronto.
 */
function FaturamentoPage() {
  const [aba, setAba] = useState<"fila" | "licencas" | "contratos" | "relatorio" | "segmentado">(
    "fila",
  );
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Receipt className="h-5 w-5" /> Faturamento
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Do ganho à nota e ao recebimento — sem e-mail no meio.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["fila", "Fila"],
              ["licencas", "Licenças PDA"],
              ["contratos", "Contratos"],
              ["relatorio", "Relatório do mês"],
              ["segmentado", "Segmentado"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setAba(v)}
              className={`rounded-full border px-3 py-1 text-[12px] ${
                aba === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>
      {aba === "fila" ? (
        <Fila />
      ) : aba === "licencas" ? (
        <Licencas />
      ) : aba === "contratos" ? (
        <Contratos />
      ) : aba === "segmentado" ? (
        <Segmentado />
      ) : (
        <Relatorio />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------
function Fila() {
  const fn = useServerFn(listarFilaFaturamento);
  const { data, isLoading, error } = useQuery({
    queryKey: ["faturamento", "fila"],
    queryFn: () => fn(),
  });
  const [aberto, setAberto] = useState<string | null>(null);

  if (isLoading) return <p className="text-[13px] text-muted-foreground">Carregando…</p>;
  if (error)
    return (
      <p className="text-[13px] text-destructive">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );
  const itens = data?.itens ?? [];

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {ETAPAS.map((e) => {
          const col = itens.filter((i) => i.etapa === e.v);
          const total = col.reduce((s, i) => s + (e.v === "a_receber" ? i.aReceber : i.valor), 0);
          return (
            <section key={e.v} className="surface-panel flex min-h-[200px] flex-col p-3">
              <div className="mb-2">
                <p className="flex items-center justify-between text-[13px] font-medium">
                  {e.l}
                  <span className="text-[11px] text-muted-foreground">{col.length}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {e.dica}
                  {col.length > 0 ? ` · ${moeda(total)}` : ""}
                </p>
              </div>
              <div className="space-y-2">
                {col.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setAberto(i.id)}
                    className="w-full rounded-md border bg-background p-2 text-left text-[12px] transition-colors hover:border-primary/50"
                  >
                    <p className="truncate font-medium">{i.empresa?.nome ?? i.nome}</p>
                    <p className="truncate text-muted-foreground">{i.nome}</p>
                    <p className="mt-1 flex justify-between gap-2">
                      <span>{moeda(e.v === "a_receber" ? i.aReceber : i.valor)}</span>
                      <span className="text-muted-foreground">{i.executivo ?? "—"}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {i.codigoWebmais ? (
                        <Badge variant="outline" className="text-[10px]">
                          WM {i.codigoWebmais}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          sem WebMais
                        </Badge>
                      )}
                      {i.emissaoPrevistaEm && e.v !== "a_receber" && e.v !== "recebido" && (
                        <Badge variant="outline" className="text-[10px]">
                          emitir {dataBr(i.emissaoPrevistaEm)}
                        </Badge>
                      )}
                      {i.vencidas > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {i.vencidas} vencida(s)
                        </Badge>
                      )}
                    </div>
                    {(e.v === "a_conferir" || e.v === "a_faturar") &&
                      i.resumoPendencias.length > 0 && (
                        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {i.resumoPendencias.join(" · ")}
                        </p>
                      )}
                    {e.v === "pendencia" && i.pendenciaAdm && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {i.pendenciaAdm}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {aberto && <NegocioDialog dealId={aberto} onClose={() => setAberto(null)} />}
    </>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[12px]">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right">{valor || "—"}</dd>
    </div>
  );
}

function NegocioDialog({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(getFaturamentoNegocio);
  const conferirFn = useServerFn(conferirNegocio);
  const devolverFn = useServerFn(devolverAoComercial);
  const cancelarFn = useServerFn(cancelarFatura);
  const receberFn = useServerFn(registrarRecebimento);
  const { data } = useQuery({
    queryKey: ["faturamento", "negocio", dealId],
    queryFn: () => fn({ data: { dealId } }),
  });
  const [devolvendo, setDevolvendo] = useState(false);
  const [textoPendencia, setTextoPendencia] = useState("");
  const [emitindo, setEmitindo] = useState(false);

  const recarrega = () => qc.invalidateQueries({ queryKey: ["faturamento"] });
  const useMut = <T,>(f: (v: T) => Promise<unknown>, msg: string) =>
    useMutation({
      mutationFn: f,
      onSuccess: () => {
        toast.success(msg);
        recarrega();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
    });
  const conferir = useMut<void>(() => conferirFn({ data: { dealId } }), "Conferido");
  const devolver = useMut<void>(
    () => devolverFn({ data: { dealId, texto: textoPendencia.trim() } }),
    "Devolvido ao comercial",
  );
  const cancelar = useMut(
    (v: { faturaId: string; motivo: string }) => cancelarFn({ data: v }),
    "Nota cancelada",
  );
  const receber = useMut(
    (v: { parcelaId: string; pagoEm: string | null }) => receberFn({ data: v }),
    "Recebimento atualizado",
  );

  const n = (data?.negocio ?? {}) as Record<string, unknown>;
  const contato = data?.contatos.find((c) => c.id === n.contato_faturamento_id);
  const notas = data?.faturas ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{data?.empresa?.nome ?? String(n.nome ?? "Negócio")}</DialogTitle>
          <DialogDescription>
            <Link
              to="/negocio/$id"
              params={{ id: dealId }}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {String(n.nome ?? "")} <ExternalLink className="h-3 w-3" />
            </Link>
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-4">
              <section className="space-y-1 rounded-md border p-3">
                <p className="section-label mb-1">O que o comercial entregou</p>
                <dl className="space-y-1">
                  <Campo rotulo="Valor bruto" valor={moeda(Number(n.amount ?? 0))} />
                  <Campo
                    rotulo="CNPJ de faturamento"
                    valor={formatarCnpj(
                      (n.cnpj_faturamento as string | null) ?? data.empresa?.cnpj ?? "",
                    )}
                  />
                  <Campo
                    rotulo="Ordem de compra"
                    valor={
                      n.oc_situacao === "nao_tem" ? (
                        "Cliente não emite"
                      ) : n.oc_situacao === "anexo" && n.oc_anexo_url ? (
                        <a
                          href={String(n.oc_anexo_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          anexo
                        </a>
                      ) : (
                        (n.ordem_compra_numero as string | null)
                      )
                    }
                  />
                  <Campo rotulo="Data da venda" valor={dataBr(n.ordem_compra_em as string)} />
                  <Campo
                    rotulo="Emissão combinada"
                    valor={dataBr(n.emissao_prevista_em as string | null)}
                  />
                  <Campo rotulo="Prazo" valor={n.prazo_pagamento as string | null} />
                  <Campo rotulo="Forma" valor={n.forma_pagamento as string | null} />
                  <Campo rotulo="Parcelas" valor={n.parcelas ? `${n.parcelas}x` : null} />
                  <Campo
                    rotulo="Recebe nota e boleto"
                    valor={
                      contato
                        ? `${contato.nome ?? ""}${contato.email ? ` · ${contato.email}` : ""}`
                        : data.politica.emails_nf.join(", ")
                    }
                  />
                  <Campo rotulo="Tipo de venda" valor={n.tipo_venda as string | null} />
                  <Campo rotulo="Produtos" valor={n.produtos_texto as string | null} />
                </dl>
                {n.observacao_adm ? (
                  <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-[12px]">
                    {String(n.observacao_adm)}
                  </p>
                ) : null}
              </section>

              {data.pendencias.length > 0 && (
                <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[12px]">
                  {data.pendencias.map((p) => (
                    <li
                      key={p.campo + p.mensagem}
                      className={
                        p.bloqueia ? "text-destructive" : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      {p.bloqueia ? "✕" : "!"} {p.mensagem}
                    </li>
                  ))}
                </ul>
              )}

              {n.adm_pendencia ? (
                <p className="rounded-md border p-2 text-[12px]">
                  <span className="font-medium">Pendência aberta com o comercial:</span>{" "}
                  {String(n.adm_pendencia)}
                </p>
              ) : null}

              {data.podeEditar && !n.faturado_em && (
                <div className="flex flex-wrap gap-2">
                  {!n.adm_checked_at && (
                    <Button
                      size="sm"
                      disabled={conferir.isPending}
                      onClick={() => conferir.mutate()}
                    >
                      Conferido — liberar para faturar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEmitindo(true)}>
                    Registrar nota
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDevolvendo((v) => !v)}>
                    Devolver ao comercial
                  </Button>
                </div>
              )}
              {data.podeEditar && n.faturado_em ? (
                <Button size="sm" variant="outline" onClick={() => setEmitindo(true)}>
                  Registrar outra nota
                </Button>
              ) : null}

              {devolvendo && (
                <div className="space-y-2 rounded-md border p-2">
                  <Textarea
                    rows={2}
                    value={textoPendencia}
                    onChange={(e) => setTextoPendencia(e.target.value)}
                    placeholder="O que falta: número da OC, contato que recebe a nota, ficha cadastral…"
                  />
                  <Button
                    size="sm"
                    disabled={textoPendencia.trim().length < 3 || devolver.isPending}
                    onClick={() =>
                      devolver.mutate(undefined, {
                        onSuccess: () => {
                          setDevolvendo(false);
                          setTextoPendencia("");
                        },
                      })
                    }
                  >
                    Enviar pendência
                  </Button>
                </div>
              )}

              {emitindo && (
                <EmitirNota
                  dealId={dealId}
                  valor={Number(n.amount ?? 0)}
                  cnpj={(n.cnpj_faturamento as string | null) ?? data.empresa?.cnpj ?? ""}
                  emissaoCombinada={(n.emissao_prevista_em as string | null) ?? null}
                  parcelas={Number(n.parcelas ?? 1) || 1}
                  politica={data.politica}
                  onDone={() => {
                    setEmitindo(false);
                    recarrega();
                  }}
                  onCancel={() => setEmitindo(false)}
                />
              )}

              {notas.length > 0 && (
                <section className="space-y-2">
                  <p className="section-label">Notas</p>
                  {notas.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded-md border p-2 text-[12px] ${f.status === "cancelada" ? "opacity-60" : ""}`}
                    >
                      <p className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          NF {f.numero_nf} · {dataBr(f.emitida_em)}
                          {f.status === "cancelada" && " · cancelada"}
                        </span>
                        <span>
                          {moeda(Number(f.valor_bruto))}
                          {Number(f.retencoes) > 0 &&
                            ` · líquido ${moeda(Number(f.valor_liquido))}`}
                        </span>
                      </p>
                      {f.status === "cancelada" && f.cancelada_motivo && (
                        <p className="text-muted-foreground">{f.cancelada_motivo}</p>
                      )}
                      {f.status === "emitida" && (
                        <ul className="mt-1 space-y-1">
                          {[...f.fatura_parcelas]
                            .sort((a, b) => a.numero - b.numero)
                            .map((p) => (
                              <li
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span
                                  className={
                                    !p.pago_em && p.vencimento < hojeIso()
                                      ? "text-destructive"
                                      : undefined
                                  }
                                >
                                  {p.numero}ª · vence {dataBr(p.vencimento)} ·{" "}
                                  {moeda(Number(p.valor))}
                                </span>
                                {data.podeEditar &&
                                  (p.pago_em ? (
                                    <button
                                      type="button"
                                      className="text-[11px] text-emerald-600 hover:underline"
                                      title="Desfazer recebimento"
                                      onClick={() =>
                                        receber.mutate({ parcelaId: p.id, pagoEm: null })
                                      }
                                    >
                                      recebida {dataBr(p.pago_em)}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="text-[11px] text-primary hover:underline"
                                      onClick={() =>
                                        receber.mutate({ parcelaId: p.id, pagoEm: hojeIso() })
                                      }
                                    >
                                      marcar recebida hoje
                                    </button>
                                  ))}
                              </li>
                            ))}
                        </ul>
                      )}
                      {f.status === "emitida" && data.podeEditar && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const motivo = window.prompt("Motivo do cancelamento da nota");
                            if (motivo && motivo.trim().length >= 3)
                              cancelar.mutate({ faturaId: f.id, motivo: motivo.trim() });
                          }}
                        >
                          Cancelar nota
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>

            <div className="space-y-3">
              {n.company_id ? (
                <div className="rounded-md border p-3">
                  <PoliticaFaturamentoCard companyId={String(n.company_id)} semMoldura />
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">Negócio sem empresa vinculada.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmitirNota({
  dealId,
  valor,
  cnpj,
  emissaoCombinada,
  parcelas,
  politica,
  onDone,
  onCancel,
}: {
  dealId: string;
  valor: number;
  cnpj: string;
  emissaoCombinada: string | null;
  parcelas: number;
  politica: Parameters<typeof calcularRetencoes>[1] &
    Parameters<typeof primeiroVencimento>[1] & {
      janela_emissao_inicio: number | null;
      janela_emissao_fim: number | null;
    };
  onDone: () => void;
  onCancel: () => void;
}) {
  const registrarFn = useServerFn(registrarFatura);
  const emissaoInicial =
    emissaoCombinada ??
    proximaEmissao(hojeIso(), politica.janela_emissao_inicio, politica.janela_emissao_fim);
  const [numero, setNumero] = useState("");
  const [emissao, setEmissao] = useState(emissaoInicial);
  const [cnpjNota, setCnpjNota] = useState(formatarCnpj(cnpj));
  const [bruto, setBruto] = useState(String(valor || ""));
  const ret = calcularRetencoes(Number(bruto) || 0, politica);
  const [retencoes, setRetencoes] = useState<string | null>(null);
  const retencaoValor = retencoes === null ? ret.total : Number(retencoes.replace(",", ".")) || 0;
  const liquido = Math.round(((Number(bruto) || 0) - retencaoValor) * 100) / 100;
  const [qtd, setQtd] = useState(String(parcelas));
  const [obs, setObs] = useState("");

  const sugeridas = useMemo(
    () =>
      gerarParcelas(liquido, Number(qtd) || 1, primeiroVencimento(emissao || hojeIso(), politica)),
    [liquido, qtd, emissao, politica],
  );
  const [editadas, setEditadas] = useState<Parcela[] | null>(null);
  const lista = editadas ?? sugeridas;
  const soma = Math.round(lista.reduce((s, p) => s + p.valor, 0) * 100) / 100;

  const salvar = useMutation({
    mutationFn: () =>
      registrarFn({
        data: {
          dealId,
          numeroNf: numero.trim(),
          emitidaEm: emissao,
          cnpj: cnpjNota || null,
          valorBruto: Number(bruto) || 0,
          retencoes: retencaoValor,
          observacao: obs.trim() || null,
          parcelas: lista.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
        },
      }),
    onSuccess: () => {
      toast.success("Nota registrada");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <section className="space-y-3 rounded-md border border-primary/40 p-3">
      <p className="section-label">Registrar nota</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px]">Número da NF</Label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Emissão</Label>
          <Input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">CNPJ</Label>
          <Input value={cnpjNota} onChange={(e) => setCnpjNota(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px]">Valor bruto</Label>
          <Input type="number" value={bruto} onChange={(e) => setBruto(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Retenções</Label>
          <Input
            inputMode="decimal"
            value={retencoes ?? ret.total.toFixed(2)}
            onChange={(e) => setRetencoes(e.target.value)}
          />
          {ret.itens.length > 0 && retencoes === null && (
            <p className="text-[10px] text-muted-foreground">
              {ret.itens.map((i) => `${i.rotulo} ${i.pct}%`).join(" + ")}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Líquido</Label>
          <p className="h-9 py-2 text-[13px] font-medium">{moeda(liquido)}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Parcelas</Label>
          <Input
            type="number"
            min={1}
            max={24}
            value={qtd}
            onChange={(e) => {
              setQtd(e.target.value);
              setEditadas(null);
            }}
          />
        </div>
      </div>
      <ul className="space-y-1">
        {lista.map((p, idx) => (
          <li key={p.numero} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{p.numero}ª</span>
            <Input
              type="date"
              value={p.vencimento}
              onChange={(e) => {
                const nova = [...lista];
                nova[idx] = { ...p, vencimento: e.target.value };
                setEditadas(nova);
              }}
            />
            <Input
              type="number"
              value={p.valor}
              onChange={(e) => {
                const nova = [...lista];
                nova[idx] = { ...p, valor: Number(e.target.value) || 0 };
                setEditadas(nova);
              }}
            />
          </li>
        ))}
      </ul>
      {Math.round(soma * 100) !== Math.round(liquido * 100) && (
        <p className="text-[11px] text-destructive">
          As parcelas somam {moeda(soma)}; o líquido é {moeda(liquido)}.
        </p>
      )}
      <Input
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observação (opcional)"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={
            !numero.trim() ||
            !emissao ||
            liquido < 0 ||
            Math.round(soma * 100) !== Math.round(liquido * 100) ||
            salvar.isPending
          }
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando…" : "Salvar nota"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Licenças PDA — substitui a planilha paralela de solicitado/liberado
// ---------------------------------------------------------------------------
function Licencas() {
  const qc = useQueryClient();
  const fn = useServerFn(listarLicencas);
  const statusFn = useServerFn(mudarStatusLicenca);
  const [abertas, setAbertas] = useState(true);
  const { data, isLoading } = useQuery({
    queryKey: ["licencas", "todas", abertas],
    queryFn: () => fn({ data: { abertas } }),
  });
  const mudar = useMutation({
    mutationFn: (v: { id: string; status: "solicitado" | "liberado" | "cancelado" }) =>
      statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licencas"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const conferir = (data?.itens ?? []).filter((l) => l.paraConferir).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={abertas} onChange={(e) => setAbertas(e.target.checked)} />
          Só as em aberto
        </label>
        {conferir > 0 && (
          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {conferir} solicitada(s) há{" "}
            {PRAZO_PDA_DIAS_UTEIS}+ dias úteis: conferir na PDA
          </span>
        )}
      </div>
      <section className="surface-panel overflow-x-auto p-3">
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (data?.itens ?? []).length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">
            Nenhuma licença. Elas nascem pelo botão “Pedir liberação” no negócio ganho.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Empresa</th>
                <th className="py-1 pr-2">Licença</th>
                <th className="py-1 pr-2">Login</th>
                <th className="py-1 pr-2">Solicitada</th>
                <th className="py-1 pr-2">Liberada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.itens.map((l) => (
                <tr key={l.id} className={`border-t ${l.paraConferir ? "bg-amber-500/5" : ""}`}>
                  <td className="py-1 pr-2">
                    {l.dealId ? (
                      <Link to="/negocio/$id" params={{ id: l.dealId }} className="hover:underline">
                        {l.empresa ?? l.negocio}
                      </Link>
                    ) : (
                      (l.empresa ?? "—")
                    )}
                  </td>
                  <td className="py-1 pr-2">{l.descricao}</td>
                  <td className="py-1 pr-2">{l.loginEmail ?? "—"}</td>
                  <td className="py-1 pr-2">{dataBr(l.solicitadoEm)}</td>
                  <td className="py-1 pr-2">{dataBr(l.liberadoEm)}</td>
                  <td className="py-1 text-right">
                    {data.podeEditar && l.status === "a_solicitar" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => mudar.mutate({ id: l.id, status: "solicitado" })}
                      >
                        Solicitei à PDA
                      </Button>
                    )}
                    {data.podeEditar && l.status === "solicitado" && (
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => mudar.mutate({ id: l.id, status: "liberado" })}
                      >
                        Liberada
                      </Button>
                    )}
                    {l.status === "liberado" && <span className="text-emerald-600">liberada</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contratos — pedidos de minuta/aditivo
// ---------------------------------------------------------------------------
function Contratos() {
  const qc = useQueryClient();
  const fn = useServerFn(listarContratos);
  const atualizarFn = useServerFn(atualizarContrato);
  const [abertos, setAbertos] = useState(true);
  const { data, isLoading } = useQuery({
    queryKey: ["contratos", "todos", abertos],
    queryFn: () => fn({ data: { abertos } }),
  });
  const atualizar = useMutation({
    mutationFn: (v: {
      id: string;
      status?: (typeof STATUS_CONTRATO)[number]["v"];
      contrato_url?: string | null;
    }) => atualizarFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contratos"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" checked={abertos} onChange={(e) => setAbertos(e.target.checked)} />
        Só os em andamento
      </label>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (data?.itens ?? []).length === 0 ? (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Nenhum pedido de contrato. O comercial pede pelo card “Contrato” no negócio.
        </p>
      ) : (
        <ul className="space-y-2">
          {data?.itens.map((c) => (
            <li key={c.id} className="surface-panel space-y-1 p-3 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium">
                  {c.tipo === "aditivo"
                    ? "Aditivo"
                    : c.tipo === "minuta_geral"
                      ? "Minuta geral"
                      : "Minuta"}{" "}
                  · {c.empresa ?? c.negocio ?? "—"}
                </p>
                <select
                  className="h-8 rounded-md border bg-background px-2"
                  value={c.status}
                  disabled={!data.podeConduzir}
                  onChange={(e) =>
                    atualizar.mutate({
                      id: c.id,
                      status: e.target.value as (typeof STATUS_CONTRATO)[number]["v"],
                    })
                  }
                >
                  {STATUS_CONTRATO.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              </div>
              <dl className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                <Campo rotulo="Compra" valor={c.compra} />
                <Campo rotulo="Vencimento" valor={c.vencimento ? dataBr(c.vencimento) : null} />
                <Campo rotulo="Parcelamento" valor={c.regrasParcelamento} />
                <Campo
                  rotulo="Valor bruto"
                  valor={c.valorBruto != null ? moeda(c.valorBruto) : null}
                />
                <Campo rotulo="Enviar para" valor={c.contatoEnvio} />
                {c.modeloCompra && <Campo rotulo="Modelo de compra" valor={c.modeloCompra} />}
              </dl>
              {c.observacoes && <p className="text-muted-foreground">{c.observacoes}</p>}
              <p className="flex flex-wrap gap-3">
                {c.fichaUrl && (
                  <a
                    href={c.fichaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    ficha cadastral
                  </a>
                )}
                {c.propostaUrl && (
                  <a
                    href={c.propostaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    proposta final
                  </a>
                )}
                {c.contratoUrl && (
                  <a
                    href={c.contratoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    contrato
                  </a>
                )}
                {data.podeConduzir && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const u = window.prompt("Link do arquivo do contrato", c.contratoUrl ?? "");
                      if (u === null) return;
                      if (u && !/^https?:\/\//.test(u)) return toast.error("Use um link http(s)");
                      atualizar.mutate({ id: c.id, contrato_url: u || null });
                    }}
                  >
                    {c.contratoUrl ? "trocar link do contrato" : "anexar link do contrato"}
                  </button>
                )}
                {c.dealId && (
                  <Link
                    to="/negocio/$id"
                    params={{ id: c.dealId }}
                    className="text-muted-foreground hover:underline"
                  >
                    negócio
                  </Link>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relatório segmentado — porte, tipo, status, produto × serviço, região…
// ---------------------------------------------------------------------------
function Segmentado() {
  const fn = useServerFn(relatorioSegmentado);
  const hoje = hojeIso();
  const [de, setDe] = useState(`${hoje.slice(0, 4)}-01-01`);
  const [ate, setAte] = useState(hoje);
  const [base, setBase] = useState<"venda" | "faturamento">("faturamento");
  const [dimensao, setDimensao] = useState<Dimensao>("regiao");
  const { data, isLoading, error } = useQuery({
    queryKey: ["faturamento", "segmentado", de, ate, base, dimensao],
    queryFn: () => fn({ data: { de, ate, base, dimensao } }),
  });
  const rotuloDim = DIMENSOES.find((d) => d.v === dimensao)?.l ?? dimensao;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={dimensao}
          onChange={(e) => setDimensao(e.target.value as Dimensao)}
        >
          {DIMENSOES.map((d) => (
            <option key={d.v} value={d.v}>
              {d.l}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={base}
          onChange={(e) => setBase(e.target.value as "venda" | "faturamento")}
        >
          <option value="faturamento">Pelo faturamento (notas emitidas)</option>
          <option value="venda">Pela venda (data do ganho)</option>
        </select>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={de}
          onChange={(e) => setDe(e.target.value)}
        />
        <span>até</span>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!data?.grupos.length}
          onClick={() =>
            data &&
            downloadCsv(
              `faturamento-${dimensao}-${de}-a-${ate}.csv`,
              data.grupos.map((g) => ({
                [rotuloDim]: g.chave,
                Negócios: g.negocios,
                Valor: g.valor.toFixed(2).replace(".", ","),
                Produto: g.produto.toFixed(2).replace(".", ","),
                Serviço: g.servico.toFixed(2).replace(".", ","),
              })),
            )
          }
        >
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Erro"}
        </p>
      ) : data ? (
        <section className="surface-panel overflow-x-auto p-3">
          <p className="mb-2 text-[12px] text-muted-foreground">
            {data.negocios} negócio(s) · {moeda(data.total)}
          </p>
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">{rotuloDim}</th>
                <th className="py-1 pr-2 text-right">Negócios</th>
                <th className="py-1 pr-2 text-right">Valor</th>
                <th className="py-1 pr-2 text-right">%</th>
                <th className="py-1 pr-2 text-right">Produto</th>
                <th className="py-1 text-right">Serviço</th>
              </tr>
            </thead>
            <tbody>
              {data.grupos.map((g) => (
                <tr key={g.chave} className="border-t">
                  <td className="py-1 pr-2">{g.chave}</td>
                  <td className="py-1 pr-2 text-right">{g.negocios}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{moeda(g.valor)}</td>
                  <td className="py-1 pr-2 text-right">
                    {data.total ? `${Math.round((g.valor / data.total) * 1000) / 10}%` : "—"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{moeda(g.produto)}</td>
                  <td className="py-1 text-right tabular-nums">{moeda(g.servico)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relatório do mês
// ---------------------------------------------------------------------------
function Relatorio() {
  const fn = useServerFn(relatorioFaturamento);
  const [mes, setMes] = useState(hojeIso().slice(0, 7));
  const { data, isLoading, error } = useQuery({
    queryKey: ["faturamento", "relatorio", mes],
    queryFn: () => fn({ data: { mes } }),
  });

  const exportar = () => {
    if (!data) return;
    downloadCsv(
      `faturamento-${mes}.csv`,
      data.linhas.map((l) => ({
        NF: l.numeroNf,
        Emissão: dataBr(l.emitidaEm),
        Empresa: l.empresa ?? "",
        CNPJ: formatarCnpj(l.cnpj),
        Negócio: l.negocio ?? "",
        Executivo: l.executivo ?? "",
        "Tipo de venda": l.tipoVenda ?? "",
        Bruto: l.bruto.toFixed(2).replace(".", ","),
        Retenções: l.retencoes.toFixed(2).replace(".", ","),
        Líquido: l.liquido.toFixed(2).replace(".", ","),
      })),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={mes}
          onChange={(e) => e.target.value && setMes(e.target.value)}
          className="h-8 w-44 text-xs"
        />
        <Button size="sm" variant="outline" disabled={!data?.linhas.length} onClick={exportar}>
          <Download className="mr-1 h-3.5 w-3.5" /> Exportar CSV
        </Button>
      </div>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Erro"}
        </p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Faturado (bruto)", moeda(data.totais.bruto), `${data.totais.notas} nota(s)`],
              ["Retenções", moeda(data.totais.retencoes), ""],
              ["Líquido", moeda(data.totais.liquido), ""],
              ["Recebido no mês", moeda(data.totais.recebido), "parcelas pagas no mês"],
              [
                "Em aberto até o fim do mês",
                moeda(data.totais.vencido + data.totais.aVencer),
                `${moeda(data.totais.vencido)} vencido`,
              ],
            ].map(([t, v, s]) => (
              <section key={t} className="surface-panel p-3">
                <p className="text-[11px] text-muted-foreground">{t}</p>
                <p className="text-lg font-semibold">{v}</p>
                {s && <p className="text-[11px] text-muted-foreground">{s}</p>}
              </section>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            <section className="surface-panel overflow-x-auto p-3">
              <table className="w-full text-[12px]">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">NF</th>
                    <th className="py-1 pr-2">Emissão</th>
                    <th className="py-1 pr-2">Empresa</th>
                    <th className="py-1 pr-2">Executivo</th>
                    <th className="py-1 pr-2 text-right">Bruto</th>
                    <th className="py-1 text-right">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground">
                        Nenhuma nota emitida neste mês.
                      </td>
                    </tr>
                  ) : (
                    data.linhas.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="py-1 pr-2">{l.numeroNf}</td>
                        <td className="py-1 pr-2">{dataBr(l.emitidaEm)}</td>
                        <td className="py-1 pr-2">
                          <Link
                            to="/negocio/$id"
                            params={{ id: l.dealId }}
                            className="hover:underline"
                          >
                            {l.empresa ?? l.negocio}
                          </Link>
                        </td>
                        <td className="py-1 pr-2">{l.executivo ?? "—"}</td>
                        <td className="py-1 pr-2 text-right">{moeda(l.bruto)}</td>
                        <td className="py-1 text-right">{moeda(l.liquido)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
            <section className="surface-panel p-3">
              <p className="section-label mb-2">Por executivo</p>
              <ul className="space-y-1 text-[12px]">
                {data.porExecutivo.map((e) => (
                  <li key={e.executivo} className="flex justify-between gap-2">
                    <span className="truncate">{e.executivo}</span>
                    <span>{moeda(e.bruto)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
