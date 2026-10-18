import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, BadgeDollarSign, History, Settings2 } from "lucide-react";
import {
  adicionarLinhaComissao,
  ajustarLinhaComissao,
  enviarComissao,
  fecharComissao,
  gerarFechamento,
  getFechamentoComissao,
  getRegrasComissao,
  painelComissao,
  responderComissao,
  salvarRegrasComissao,
} from "@/lib/comissao.functions";
import { moeda } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/comissao")({
  component: ComissaoPage,
  head: () => ({ meta: [{ title: "Comissão | Grou Compass" }] }),
});

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const STATUS: Record<string, { l: string; c: string }> = {
  previa: { l: "prévia", c: "text-muted-foreground" },
  aberto: { l: "em conferência", c: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
  conferido_adm: { l: "aguardando executivo", c: "border-sky-500/40 text-sky-600" },
  contestado: { l: "contestado", c: "border-red-500/40 text-red-600" },
  aprovado_executivo: { l: "aprovado", c: "border-emerald-500/40 text-emerald-600" },
  fechado: { l: "fechado", c: "border-emerald-600 bg-emerald-500/10 text-emerald-700" },
};
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Painel de comissionamento. O executivo vê o dele, mês a mês, em função da
 * meta de produto e de serviço. O ADM confere linha a linha (a "conferência"
 * da planilha), ajusta com justificativa e envia; o executivo aprova ou
 * contesta; o ADM fecha. Tudo fica no histórico.
 */
function ComissaoPage() {
  const fn = useServerFn(painelComissao);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [executivoId, setExecutivoId] = useState<string>("");
  const [aberto, setAberto] = useState<{ mes: number; id: string | null } | null>(null);
  const [regras, setRegras] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["comissao", ano, executivoId],
    queryFn: () => fn({ data: { ano, executivoId: executivoId || undefined } }),
  });

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BadgeDollarSign className="h-5 w-5" /> Comissão
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Base de {data?.regra.base_pct ?? 5}% da meta, separada em produto e serviço, pela faixa
            de atingimento. Nada muda sem o ADM e o executivo de acordo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.podeEditar && (
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={executivoId}
              onChange={(e) => setExecutivoId(e.target.value)}
            >
              <option value="">Eu</option>
              {data.executivos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          )}
          <Input
            type="number"
            className="h-8 w-24 text-xs"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value) || ano)}
          />
          {data?.podeEditar && (
            <Button size="sm" variant="outline" onClick={() => setRegras(true)}>
              <Settings2 className="mr-1 h-3.5 w-3.5" /> Regra
            </Button>
          )}
        </div>
      </header>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Erro"}
        </p>
      ) : data ? (
        <>
          <section className="surface-panel overflow-x-auto p-3">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Mês</th>
                  <th className="py-1 pr-2 text-right">Meta produto</th>
                  <th className="py-1 pr-2 text-right">Resultado</th>
                  <th className="py-1 pr-2 text-right">%</th>
                  <th className="py-1 pr-2 text-right">Meta serviço</th>
                  <th className="py-1 pr-2 text-right">Resultado</th>
                  <th className="py-1 pr-2 text-right">%</th>
                  <th className="py-1 pr-2 text-right">Comissão</th>
                  <th className="py-1 pr-2 text-right">Super meta</th>
                  <th className="py-1 pr-2 text-right">Self Guru</th>
                  <th className="py-1 pr-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.meses.map((m) => {
                  const r = m.resultado;
                  const st = STATUS[m.status] ?? STATUS.previa;
                  return (
                    <tr
                      key={m.mes}
                      className="cursor-pointer border-t hover:bg-muted/40"
                      onClick={() => setAberto({ mes: m.mes, id: m.fechamentoId })}
                    >
                      <td className="py-1.5 pr-2 font-medium">{MESES[m.mes - 1]}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {moeda(r.produto.meta)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {moeda(r.produto.realizado)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{pct(r.produto.pct)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {moeda(r.servico.meta)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {moeda(r.servico.realizado)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{pct(r.servico.pct)}</td>
                      <td className="py-1.5 pr-2 text-right font-medium tabular-nums">
                        {moeda(r.total)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                        {r.superMeta ? moeda(r.superMeta) : "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                        {m.realizadoSelfGuru ? moeda(m.realizadoSelfGuru) : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge variant="outline" className={`text-[10px] ${st.c}`}>
                          {st.l}
                        </Badge>
                        {m.metaSemDivisao && (
                          <span
                            className="ml-1 text-amber-700 dark:text-amber-400"
                            title="Meta sem divisão produto/serviço"
                          >
                            <AlertTriangle className="inline h-3 w-3" />
                          </span>
                        )}
                        {m.semTipo > 0 && (
                          <span
                            className="ml-1 text-[10px] text-amber-700 dark:text-amber-400"
                            title="Venda sem tipo: não entra na comissão até ser classificada"
                          >
                            {moeda(m.semTipo)} sem tipo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.trimestres.map((q) => (
              <section key={q.q} className="surface-panel p-3 text-[12px]">
                <p className="font-medium">Q{q.q}</p>
                <p className="text-muted-foreground">
                  Produto {moeda(q.realizadoProduto)} de {moeda(q.metaProduto)}
                </p>
                <p className="text-muted-foreground">
                  Serviço {moeda(q.realizadoServico)} de {moeda(q.metaServico)}
                </p>
                <p className="mt-1 font-medium">{moeda(q.total)}</p>
              </section>
            ))}
            <section className="surface-panel p-3 text-[12px]">
              <p className="font-medium">Ano</p>
              <p className="text-lg font-semibold">{moeda(data.totalAno)}</p>
              <p className="text-muted-foreground">fechado + prévia</p>
            </section>
          </div>
          <p className="text-[11px] text-muted-foreground">
            “Prévia” é o cálculo ao vivo pelos negócios ganhos; vira número oficial quando o ADM
            gera o fechamento, confere e o executivo aprova.
          </p>
        </>
      ) : null}

      {aberto && data && (
        <MesDialog
          ano={ano}
          mes={aberto.mes}
          fechamentoId={aberto.id}
          executivoId={data.alvo}
          podeEditar={data.podeEditar}
          onClose={() => setAberto(null)}
        />
      )}
      {regras && <RegrasDialog ano={ano} onClose={() => setRegras(false)} />}
    </div>
  );
}

function MesDialog({
  ano,
  mes,
  fechamentoId,
  executivoId,
  podeEditar,
  onClose,
}: {
  ano: number;
  mes: number;
  fechamentoId: string | null;
  executivoId: string;
  podeEditar: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [id, setId] = useState(fechamentoId);
  const getFn = useServerFn(getFechamentoComissao);
  const gerarFn = useServerFn(gerarFechamento);
  const ajustarFn = useServerFn(ajustarLinhaComissao);
  const addFn = useServerFn(adicionarLinhaComissao);
  const enviarFn = useServerFn(enviarComissao);
  const responderFn = useServerFn(responderComissao);
  const fecharFn = useServerFn(fecharComissao);
  const { data } = useQuery({
    queryKey: ["comissao-fechamento", id],
    queryFn: () => getFn({ data: { id: id as string } }),
    enabled: !!id,
  });
  const recarrega = () => {
    qc.invalidateQueries({ queryKey: ["comissao-fechamento"] });
    qc.invalidateQueries({ queryKey: ["comissao"] });
  };
  const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro");
  const mesTxt = `${ano}-${String(mes).padStart(2, "0")}`;

  const gerar = useMutation({
    mutationFn: () => gerarFn({ data: { executivoId, mes: mesTxt } }),
    onSuccess: (r) => {
      setId(r.id);
      toast.success("Fechamento atualizado com os negócios do mês");
      recarrega();
    },
    onError: erro,
  });
  const ajustar = useMutation({
    mutationFn: (v: {
      linhaId: string;
      conferida?: boolean;
      excluida?: boolean;
      valorConsiderado?: number;
      tipo?: "produto" | "servico" | null;
      motivo?: string;
    }) => ajustarFn({ data: v }),
    onSuccess: recarrega,
    onError: erro,
  });
  const acao = useMutation({
    mutationFn: async (a: "enviar" | "aprovar" | "contestar" | "fechar") => {
      if (!id) return;
      if (a === "enviar") return enviarFn({ data: { id } });
      if (a === "fechar") return fecharFn({ data: { id } });
      const texto = a === "contestar" ? window.prompt("O que está errado?") : null;
      if (a === "contestar" && (!texto || texto.trim().length < 3)) return;
      return responderFn({ data: { id, aprova: a === "aprovar", texto } });
    },
    onSuccess: () => {
      toast.success("Feito");
      recarrega();
    },
    onError: erro,
  });
  const [nova, setNova] = useState<null | {
    cliente: string;
    item: string;
    tipo: "produto" | "servico";
    valor: string;
    motivo: string;
  }>(null);
  const adicionar = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          fechamentoId: id as string,
          cliente: nova!.cliente,
          item: nova!.item,
          marca: null,
          tipo: nova!.tipo,
          valor: Number(nova!.valor) || 0,
          motivo: nova!.motivo,
        },
      }),
    onSuccess: () => {
      setNova(null);
      recarrega();
    },
    onError: erro,
  });

  const f = data?.fechamento;
  const status = String(f?.status ?? "");
  const editavelAdm = podeEditar && !!f && status !== "fechado";
  const [historico, setHistorico] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            Comissão de {MESES[mes - 1]}/{ano}
            {data?.executivo ? ` · ${data.executivo}` : ""}
          </DialogTitle>
          <DialogDescription>
            {f ? (
              <Badge variant="outline" className={STATUS[status]?.c}>
                {STATUS[status]?.l ?? status}
              </Badge>
            ) : (
              "Ainda sem fechamento — os números da tabela são a prévia."
            )}
          </DialogDescription>
        </DialogHeader>

        {!id ? (
          podeEditar ? (
            <Button disabled={gerar.isPending} onClick={() => gerar.mutate()}>
              {gerar.isPending ? "Gerando…" : "Gerar fechamento deste mês"}
            </Button>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              O ADM ainda não gerou o fechamento deste mês.
            </p>
          )
        ) : !data ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 text-[12px] sm:grid-cols-4">
              {[
                ["Produto", f!.realizado_produto, f!.meta_produto, f!.comissao_produto],
                ["Serviço", f!.realizado_servico, f!.meta_servico, f!.comissao_servico],
              ].map(([t, real, meta, com]) => (
                <section key={String(t)} className="rounded-md border p-2">
                  <p className="font-medium">{t}</p>
                  <p>
                    {moeda(Number(real))} de {moeda(Number(meta))}
                  </p>
                  <p className="text-muted-foreground">comissão {moeda(Number(com))}</p>
                </section>
              ))}
              <section className="rounded-md border p-2">
                <p className="font-medium">Super meta</p>
                <p>{moeda(Number(f!.super_meta))}</p>
                <p className="text-muted-foreground">
                  {data.regra.super_meta_soma ? "soma no total" : "fora do total"}
                </p>
              </section>
              <section className="rounded-md border border-primary/40 p-2">
                <p className="font-medium">Total</p>
                <p className="text-lg font-semibold">{moeda(Number(f!.total))}</p>
              </section>
            </div>
            {f!.contestacao ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-[12px]">
                <strong>Contestação do executivo:</strong> {String(f!.contestacao)}
              </p>
            ) : null}

            <section className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[12px]">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Conferida</th>
                    <th className="py-1 pr-2">Cliente</th>
                    <th className="py-1 pr-2">Item</th>
                    <th className="py-1 pr-2">Tipo</th>
                    <th className="py-1 pr-2 text-right">Valor</th>
                    <th className="py-1 pr-2 text-right">Considerado</th>
                    <th className="py-1 pr-2">Novo?</th>
                    <th className="py-1 pr-2">Ajuste</th>
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.map((l) => (
                    <tr
                      key={String(l.id)}
                      className={`border-t ${l.excluida ? "opacity-50 line-through" : ""}`}
                    >
                      <td className="py-1 pr-2">
                        <input
                          type="checkbox"
                          checked={!!l.conferida}
                          disabled={!editavelAdm}
                          onChange={(e) =>
                            ajustar.mutate({ linhaId: String(l.id), conferida: e.target.checked })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">{String(l.cliente ?? "—")}</td>
                      <td className="py-1 pr-2">
                        {String(l.item)}
                        {l.origem === "manual" && (
                          <span className="ml-1 text-[10px] text-muted-foreground">(manual)</span>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        {editavelAdm ? (
                          <select
                            className="h-7 rounded border bg-background px-1"
                            value={String(l.tipo ?? "")}
                            onChange={(e) =>
                              ajustar.mutate({
                                linhaId: String(l.id),
                                tipo: (e.target.value || null) as "produto" | "servico" | null,
                              })
                            }
                          >
                            <option value="">sem tipo</option>
                            <option value="produto">produto</option>
                            <option value="servico">serviço</option>
                          </select>
                        ) : (
                          String(l.tipo ?? "sem tipo")
                        )}
                        {l.marca ? (
                          <span className="ml-1 text-muted-foreground">{String(l.marca)}</span>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {moeda(Number(l.valor_original))}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {moeda(Number(l.valor_considerado))}
                      </td>
                      <td className="py-1 pr-2">{l.cliente_novo ? "sim" : "—"}</td>
                      <td className="py-1 pr-2">
                        {l.ajuste_motivo ? (
                          <span className="text-muted-foreground">{String(l.ajuste_motivo)}</span>
                        ) : null}
                        {editavelAdm && (
                          <span className="ml-1 inline-flex gap-1">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => {
                                const v = window.prompt(
                                  "Valor considerado",
                                  String(l.valor_considerado),
                                );
                                if (v == null) return;
                                const motivo =
                                  window.prompt("Motivo do ajuste (obrigatório)") ?? "";
                                if (motivo.trim().length < 3)
                                  return toast.error("Informe o motivo");
                                ajustar.mutate({
                                  linhaId: String(l.id),
                                  valorConsiderado: Number(v.replace(",", ".")) || 0,
                                  motivo: motivo.trim(),
                                });
                              }}
                            >
                              ajustar
                            </button>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (l.excluida)
                                  return ajustar.mutate({ linhaId: String(l.id), excluida: false });
                                const motivo = window.prompt("Por que excluir esta linha?") ?? "";
                                if (motivo.trim().length < 3)
                                  return toast.error("Informe o motivo");
                                ajustar.mutate({
                                  linhaId: String(l.id),
                                  excluida: true,
                                  motivo: motivo.trim(),
                                });
                              }}
                            >
                              {l.excluida ? "reincluir" : "excluir"}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {editavelAdm && !nova && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setNova({ cliente: "", item: "", tipo: "produto", valor: "", motivo: "" })
                }
              >
                Linha manual
              </Button>
            )}
            {nova && (
              <div className="grid gap-2 rounded-md border p-2 text-[12px] sm:grid-cols-5">
                <Input
                  placeholder="Cliente"
                  value={nova.cliente}
                  onChange={(e) => setNova({ ...nova, cliente: e.target.value })}
                />
                <Input
                  placeholder="Item"
                  value={nova.item}
                  onChange={(e) => setNova({ ...nova, item: e.target.value })}
                />
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  value={nova.tipo}
                  onChange={(e) =>
                    setNova({ ...nova, tipo: e.target.value as "produto" | "servico" })
                  }
                >
                  <option value="produto">Produto</option>
                  <option value="servico">Serviço</option>
                </select>
                <Input
                  placeholder="Valor"
                  inputMode="decimal"
                  value={nova.valor}
                  onChange={(e) => setNova({ ...nova, valor: e.target.value })}
                />
                <Input
                  placeholder="Motivo"
                  value={nova.motivo}
                  onChange={(e) => setNova({ ...nova, motivo: e.target.value })}
                />
                <div className="flex gap-2 sm:col-span-5">
                  <Button
                    size="sm"
                    disabled={
                      !nova.cliente ||
                      !nova.item ||
                      nova.motivo.trim().length < 3 ||
                      adicionar.isPending
                    }
                    onClick={() => adicionar.mutate()}
                  >
                    Adicionar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNova(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t pt-3">
              {podeEditar && (status === "aberto" || status === "contestado") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={gerar.isPending}
                    onClick={() => gerar.mutate()}
                  >
                    Atualizar com o CRM
                  </Button>
                  <Button size="sm" disabled={acao.isPending} onClick={() => acao.mutate("enviar")}>
                    Enviar para o executivo aprovar
                  </Button>
                </>
              )}
              {data.souDono && status === "conferido_adm" && (
                <>
                  <Button
                    size="sm"
                    disabled={acao.isPending}
                    onClick={() => acao.mutate("aprovar")}
                  >
                    Aprovo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acao.isPending}
                    onClick={() => acao.mutate("contestar")}
                  >
                    Contestar
                  </Button>
                </>
              )}
              {podeEditar && status === "aprovado_executivo" && (
                <Button size="sm" disabled={acao.isPending} onClick={() => acao.mutate("fechar")}>
                  Fechar o mês
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setHistorico((v) => !v)}>
                <History className="mr-1 h-3.5 w-3.5" /> Histórico
              </Button>
            </div>

            {historico && (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2 text-[11px]">
                {data.eventos.map((e) => (
                  <li key={e.id}>
                    <span className="text-muted-foreground">
                      {new Date(e.quando).toLocaleString("pt-BR")} · {e.autor}
                    </span>{" "}
                    — {e.acao.replace(/_/g, " ")}
                    {e.resumo ? `: ${e.resumo}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegrasDialog({ ano, onClose }: { ano: number; onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getRegrasComissao);
  const salvarFn = useServerFn(salvarRegrasComissao);
  const { data } = useQuery({
    queryKey: ["comissao-regras", ano],
    queryFn: () => getFn({ data: { ano } }),
  });
  const [form, setForm] = useState<null | {
    base: string;
    faixas: Array<{ min: string; fator: string }>;
    soma: boolean;
    selfGuru: string;
  }>(null);
  const f =
    form ??
    (data
      ? {
          base: String(data.regra.base_pct),
          faixas: data.regra.faixas.map((x) => ({ min: String(x.min), fator: String(x.fator) })),
          soma: data.regra.super_meta_soma,
          selfGuru: String(data.regra.meta_self_guru_mensal),
        }
      : null);
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          ano,
          base_pct: Number(f!.base.replace(",", ".")),
          faixas: f!.faixas.map((x) => ({ min: Number(x.min), fator: Number(x.fator) })),
          super_meta_soma: f!.soma,
          meta_self_guru_mensal: Number(f!.selfGuru) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Regra salva");
      qc.invalidateQueries({ queryKey: ["comissao"] });
      qc.invalidateQueries({ queryKey: ["comissao-regras"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regra de comissão {ano}</DialogTitle>
          <DialogDescription>
            Vale para os fechamentos ainda não fechados. Fechado não é recalculado.
          </DialogDescription>
        </DialogHeader>
        {!f ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Base (% da meta)</Label>
                <Input value={f.base} onChange={(e) => setForm({ ...f, base: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Meta Self Guru / mês</Label>
                <Input
                  value={f.selfGuru}
                  onChange={(e) => setForm({ ...f, selfGuru: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">
                Faixas: a partir de X% de atingimento → Y% da base
              </Label>
              {f.faixas.map((x, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="h-8 w-20"
                    value={x.min}
                    onChange={(e) =>
                      setForm({
                        ...f,
                        faixas: f.faixas.map((y, j) =>
                          j === i ? { ...y, min: e.target.value } : y,
                        ),
                      })
                    }
                  />
                  <span className="text-[12px] text-muted-foreground">% →</span>
                  <Input
                    className="h-8 w-20"
                    value={x.fator}
                    onChange={(e) =>
                      setForm({
                        ...f,
                        faixas: f.faixas.map((y, j) =>
                          j === i ? { ...y, fator: e.target.value } : y,
                        ),
                      })
                    }
                  />
                  <span className="text-[12px] text-muted-foreground">% da base</span>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.soma}
                onChange={(e) => setForm({ ...f, soma: e.target.checked })}
              />
              Somar a super meta ao total (na planilha atual não soma)
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!f || salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
