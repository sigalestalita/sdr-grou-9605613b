import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { getItensNegocio, listarCatalogo, salvarItensNegocio } from "@/lib/catalogo.functions";
import {
  dividirNegocio,
  proposta,
  TIPO_LABEL,
  totalItem,
  type TipoItem,
} from "@/lib/catalogo/itens";
import { moeda } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Linha = {
  product_id: string | null;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  tipo: TipoItem | null;
};

/**
 * Itens da proposta. Escolher do catálogo traz o preço de tabela e o tipo
 * (produto/serviço); a soma vira o valor do negócio e a meta se divide sozinha.
 * Embaixo, a conta da proposta: total → impostos → valor final.
 */
export function ItensNegocio({ dealId, editavel }: { dealId: string; editavel: boolean }) {
  const qc = useQueryClient();
  const itensFn = useServerFn(getItensNegocio);
  const catalogoFn = useServerFn(listarCatalogo);
  const salvarFn = useServerFn(salvarItensNegocio);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["itens-negocio", dealId],
    queryFn: () => itensFn({ data: { dealId } }),
    refetchOnWindowFocus: false,
  });
  const { data: catalogo } = useQuery({
    queryKey: ["catalogo"],
    queryFn: () => catalogoFn(),
    staleTime: 5 * 60_000,
    enabled: editavel,
  });

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [impostos, setImpostos] = useState<string>("");
  // Recomeça do servidor a cada dado novo (inclusive depois de salvar), e não
  // do cache antigo — senão um segundo "salvar" regravaria a lista anterior.
  useEffect(() => {
    if (!data) return;
    setLinhas(data.itens.map(({ marca: _m, ...l }) => l));
    setImpostos(data.valorImpostos == null ? "" : String(data.valorImpostos));
  }, [data, dataUpdatedAt]);

  const atual: Linha[] = linhas ?? [];
  const total = atual.reduce((s, i) => s + totalItem(i), 0);
  const conta = proposta(total, impostos === "" ? null : Number(impostos.replace(",", ".")));
  const divisao = dividirNegocio(data?.valor ?? 0, atual);
  const sujo =
    !!data &&
    (JSON.stringify(
      atual.map(({ product_id, nome, quantidade, valor_unitario }) => [
        product_id,
        nome,
        quantidade,
        valor_unitario,
      ]),
    ) !==
      JSON.stringify(
        data.itens.map(({ product_id, nome, quantidade, valor_unitario }) => [
          product_id,
          nome,
          quantidade,
          valor_unitario,
        ]),
      ) ||
      (impostos === "" ? null : Number(impostos.replace(",", "."))) !== data.valorImpostos);

  const ativos = useMemo(() => (catalogo?.produtos ?? []).filter((p) => p.ativo), [catalogo]);
  const grupos = useMemo(() => {
    const m = new Map<string, typeof ativos>();
    for (const p of ativos) {
      const k = `${p.marca ?? "Sem marca"} · ${p.tipo ? TIPO_LABEL[p.tipo] : "sem tipo"}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [ativos]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          dealId,
          itens: atual.map(({ product_id, nome, quantidade, valor_unitario }) => ({
            product_id,
            nome,
            quantidade,
            valor_unitario,
          })),
          valorImpostos: impostos === "" ? null : conta.impostos,
        },
      }),
    onSuccess: () => {
      toast.success("Itens salvos");
      qc.invalidateQueries({ queryKey: ["itens-negocio", dealId] });
      qc.invalidateQueries({ queryKey: ["negocio", dealId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const muda = (idx: number, patch: Partial<Linha>) =>
    setLinhas(atual.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const escolher = (idx: number, productId: string) => {
    const p = ativos.find((x) => x.id === productId);
    if (!p) return;
    muda(idx, {
      product_id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      valor_unitario: p.preco_tabela ?? atual[idx]?.valor_unitario ?? 0,
    });
  };

  if (!data) return null;

  return (
    <section className="surface-panel space-y-3 p-4">
      <p className="section-label">Itens da proposta</p>
      {atual.length === 0 && (
        <p className="text-[12px] text-muted-foreground">
          Sem itens: o valor do negócio entra como “sem tipo” na meta. Adicione do catálogo para
          dividir em produto e serviço.
        </p>
      )}
      <ul className="space-y-2">
        {atual.map((l, idx) => (
          <li key={idx} className="space-y-1 rounded-md border p-2">
            {editavel ? (
              <select
                className="h-8 w-full rounded-md border bg-background px-2 text-[12px]"
                value={l.product_id ?? ""}
                onChange={(e) => escolher(idx, e.target.value)}
              >
                <option value="">{l.product_id ? "—" : l.nome || "Escolha do catálogo"}</option>
                {grupos.map(([g, ps]) => (
                  <optgroup key={g} label={g}>
                    {ps.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.preco_tabela != null ? ` — ${moeda(p.preco_tabela)}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <p className="text-[12px] font-medium">{l.nome}</p>
            )}
            <div className="grid grid-cols-[4rem_1fr_auto_auto] items-center gap-1.5 text-[12px]">
              <Input
                type="number"
                min={0}
                className="h-8"
                value={l.quantidade}
                disabled={!editavel}
                onChange={(e) => muda(idx, { quantidade: Number(e.target.value) || 0 })}
                title="Quantidade"
              />
              <Input
                type="number"
                min={0}
                className="h-8"
                value={l.valor_unitario}
                disabled={!editavel}
                onChange={(e) => muda(idx, { valor_unitario: Number(e.target.value) || 0 })}
                title="Valor unitário"
              />
              <span className="w-24 text-right tabular-nums">{moeda(totalItem(l))}</span>
              {editavel ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setLinhas(atual.filter((_, i) => i !== idx))}
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {l.tipo ? TIPO_LABEL[l.tipo] : "Sem tipo — o ADM classifica no catálogo"}
            </p>
          </li>
        ))}
      </ul>
      {editavel && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setLinhas([
              ...atual,
              { product_id: null, nome: "", quantidade: 1, valor_unitario: 0, tipo: null },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar item
        </Button>
      )}

      {atual.length > 0 && (
        <dl className="space-y-1 border-t pt-2 text-[12px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Valor total</dt>
            <dd className="tabular-nums">{moeda(conta.total)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Impostos retidos</dt>
            <dd className="flex items-center gap-1">
              {editavel && data.retencaoPct > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setImpostos(((conta.total * data.retencaoPct) / 100).toFixed(2))}
                >
                  {data.retencaoPct.toLocaleString("pt-BR")}% da política
                </button>
              )}
              <Input
                className="h-7 w-28 text-right"
                inputMode="decimal"
                value={impostos}
                disabled={!editavel}
                onChange={(e) => setImpostos(e.target.value)}
                placeholder="0,00"
              />
            </dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Valor final</dt>
            <dd className="tabular-nums">{moeda(conta.final)}</dd>
          </div>
          <div className="flex justify-between pt-1 text-[11px] text-muted-foreground">
            <span>Produto {moeda(divisao.produto)}</span>
            <span>Serviço {moeda(divisao.servico)}</span>
            {divisao.semTipo > 0 && <span>Sem tipo {moeda(divisao.semTipo)}</span>}
          </div>
        </dl>
      )}

      {editavel && sujo && (
        <Button
          size="sm"
          disabled={salvar.isPending || atual.some((l) => !l.nome.trim())}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando…" : "Salvar itens"}
        </Button>
      )}
    </section>
  );
}
