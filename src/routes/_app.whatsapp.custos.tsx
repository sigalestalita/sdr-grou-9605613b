import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CATEGORIAS,
  ROTULO_DA_CATEGORIA,
  type Categoria,
  type ModeloDeCobranca,
  compararModelos,
  custoDoMes,
  emReais,
  formatarDolar,
  formatarReais,
  semPrecoConfigurado,
} from "@/lib/whatsapp/custos";
import { resumoDeCustosWhatsapp, salvarPrecosWhatsapp } from "@/lib/whatsapp-custos.functions";

export const Route = createFileRoute("/_app/whatsapp/custos")({ component: CustosPage });

const nomeDoMes = (mes: string) => {
  const [ano, m] = mes.split("-");
  const data = new Date(Number(ano), Number(m) - 1, 1);
  return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

function CustosPage() {
  const resumoFn = useServerFn(resumoDeCustosWhatsapp);
  const salvarFn = useServerFn(salvarPrecosWhatsapp);
  const qc = useQueryClient();
  const [meses, setMeses] = useState(6);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-custos", meses],
    queryFn: () => resumoFn({ data: { meses } }),
  });

  const [modelos, setModelos] = useState<ModeloDeCobranca[]>([]);
  const [cambio, setCambio] = useState(5.14);
  useEffect(() => {
    if (data?.modelos) setModelos(data.modelos);
    if (data?.cambio) setCambio(data.cambio);
  }, [data?.modelos, data?.cambio]);

  const reais = (dolares: number) => formatarReais(emReais(dolares, cambio));

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { modelos, cambio } }),
    onSuccess: () => {
      toast.success("Tabela de preços salva");
      qc.invalidateQueries({ queryKey: ["wa-custos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const atual = modelos[0];
  const futuro = modelos[1];
  const volumes = useMemo(() => data?.volumes ?? [], [data?.volumes]);
  const comparacao = useMemo(
    () => (atual && futuro ? compararModelos(volumes, atual, futuro) : []),
    [volumes, atual, futuro],
  );
  const ultimoMes = volumes.length ? volumes[volumes.length - 1] : null;
  const faltaPreco = !atual || semPrecoConfigurado(atual);

  const mudarPreco = (indice: number, categoria: Categoria, valor: string) => {
    const numero = Number(valor.replace(",", "."));
    setModelos((anteriores) =>
      anteriores.map((m, i) =>
        i === indice
          ? { ...m, precos: { ...m.precos, [categoria]: Number.isFinite(numero) ? numero : 0 } }
          : m,
      ),
    );
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Custos da mensageria</h2>
          <p className="text-xs text-muted-foreground">
            {data?.mensagensLidas.toLocaleString("pt-BR")} mensagens lidas desde{" "}
            {data?.desde ? new Date(data.desde).toLocaleDateString("pt-BR") : "—"}. Só template
            enviado entra na conta: recebida e resposta livre dentro da janela não são cobradas.
          </p>
        </div>
        <select
          value={meses}
          onChange={(e) => setMeses(Number(e.target.value))}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {[3, 6, 12].map((n) => (
            <option key={n} value={n}>
              últimos {n} meses
            </option>
          ))}
        </select>
      </div>

      {faltaPreco && (
        <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">A tabela de preços ainda está em branco</p>
            <p className="text-muted-foreground">
              O volume abaixo é real, mas o custo só aparece depois que você preencher os valores.
              Eles variam por país e por acordo comercial. Copie do WhatsApp Manager, em Insights →
              Cobrança.
            </p>
          </div>
        </Card>
      )}

      {ultimoMes && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIAS.map((c) => (
            <Card key={c} className="p-4">
              <p className="text-xs text-muted-foreground">{ROTULO_DA_CATEGORIA[c]}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {ultimoMes.enviadosPorCategoria[c].toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                templates em {nomeDoMes(ultimoMes.mes)} ·{" "}
                {ultimoMes.conversasPorCategoria[c].toLocaleString("pt-BR")} conversas
              </p>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-x-auto p-4">
        <h3 className="mb-3 font-semibold">Volume e custo por mês</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="p-2 text-left">Mês</th>
              {CATEGORIAS.map((c) => (
                <th key={c} className="p-2 text-right">
                  {ROTULO_DA_CATEGORIA[c]}
                </th>
              ))}
              <th
                className="p-2 text-right"
                title="Utilidade enviada com a janela de 24h aberta: a Meta não cobra"
              >
                Grátis na janela
              </th>
              <th className="p-2 text-right">Livres</th>
              <th className="p-2 text-right">Recebidas</th>
              <th className="p-2 text-right">Custo hoje</th>
              <th className="p-2 text-right">Depois de 01/10</th>
              <th className="p-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {volumes.map((v, i) => {
              const comp = comparacao[i];
              return (
                <tr key={v.mes} className="border-b border-border/50">
                  <td className="p-2 text-left">{nomeDoMes(v.mes)}</td>
                  {CATEGORIAS.map((c) => (
                    <td key={c} className="p-2 text-right">
                      {v.enviadosPorCategoria[c].toLocaleString("pt-BR")}
                    </td>
                  ))}
                  <td className="p-2 text-right text-emerald-600 dark:text-emerald-400">
                    {Object.values(v.gratuitosNaJanela)
                      .reduce((a, b) => a + b, 0)
                      .toLocaleString("pt-BR")}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">
                    {v.respostasLivres.toLocaleString("pt-BR")}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">
                    {v.recebidas.toLocaleString("pt-BR")}
                  </td>
                  <td className="p-2 text-right">
                    {atual ? reais(custoDoMes(v, atual).total) : "—"}
                  </td>
                  <td className="p-2 text-right">
                    {futuro ? reais(custoDoMes(v, futuro).total) : "—"}
                  </td>
                  <td
                    className={`p-2 text-right ${
                      !comp || comp.diferenca === 0
                        ? "text-muted-foreground"
                        : comp.diferenca > 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {comp
                      ? `${comp.diferenca > 0 ? "+" : ""}${reais(comp.diferenca)}${
                          comp.variacao === null
                            ? ""
                            : ` (${comp.variacao > 0 ? "+" : ""}${Math.round(comp.variacao * 100)}%)`
                        }`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {volumes.length === 0 && (
              <tr>
                <td colSpan={10} className="p-4 text-center text-muted-foreground">
                  Nenhuma mensagem no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Tabela de preços</h3>
            <p className="text-xs text-muted-foreground">
              Valor unitário <strong>em dólar por mensagem</strong>, que é como a Meta publica. O
              real ao lado é estimativa pela cotação abaixo, não fatura.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs">
              <span className="text-muted-foreground">Cotação US$ → R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cambio}
                onChange={(e) => setCambio(Number(e.target.value) || 0)}
                className="mt-0.5 h-9 w-28 rounded-md border border-border bg-background px-2 tabular-nums"
              />
            </label>
            <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {modelos.map((m, i) => (
            <div key={m.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{m.nome}</p>
                <span className="text-[11px] text-muted-foreground">
                  cobrança por {m.unidade}
                  {m.vigenteDe ? ` · a partir de ${m.vigenteDe}` : ""}
                </span>
              </div>
              {m.nota && <p className="text-[11px] text-muted-foreground">{m.nota}</p>}
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS.map((c) => (
                  <label key={c} className="text-xs">
                    <span className="text-muted-foreground">
                      {ROTULO_DA_CATEGORIA[c]}{" "}
                      <span className="tabular-nums">{reais(m.precos[c] ?? 0)}</span>
                    </span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={m.precos[c]}
                      onChange={(e) => mudarPreco(i, c, e.target.value)}
                      title={`${formatarDolar(m.precos[c] ?? 0)} por mensagem`}
                      className="mt-0.5 h-9 w-full rounded-md border border-border bg-background px-2 tabular-nums"
                    />
                  </label>
                ))}
              </div>
              <label className="block text-xs">
                <span className="text-muted-foreground">Cobrança por</span>
                <select
                  value={m.unidade}
                  onChange={(e) =>
                    setModelos((ant) =>
                      ant.map((x, j) =>
                        j === i ? { ...x, unidade: e.target.value as "conversa" | "mensagem" } : x,
                      ),
                    )
                  }
                  className="mt-0.5 h-9 w-full rounded-md border border-border bg-background px-2"
                >
                  <option value="mensagem">mensagem enviada</option>
                  <option value="conversa">conversa aberta (modelo antigo)</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      </Card>

      {(data?.porTemplate.length ?? 0) > 0 && (
        <Card className="overflow-x-auto p-4">
          <h3 className="mb-3 font-semibold">Quem mais dispara</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-left">Template</th>
                <th className="p-2 text-left">Categoria</th>
                <th className="p-2 text-right">Enviados</th>
                <th className="p-2 text-right">Custo hoje</th>
                <th className="p-2 text-right">Depois de 01/10</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data?.porTemplate.map((t) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="p-2 text-left">{t.nome}</td>
                  <td className="p-2 text-left text-muted-foreground">
                    {ROTULO_DA_CATEGORIA[t.categoria]}
                  </td>
                  <td className="p-2 text-right">{t.enviados.toLocaleString("pt-BR")}</td>
                  <td className="p-2 text-right">
                    {atual ? reais(t.enviados * (atual.precos[t.categoria] ?? 0)) : "—"}
                  </td>
                  <td className="p-2 text-right">
                    {futuro ? reais(t.enviados * (futuro.precos[t.categoria] ?? 0)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
