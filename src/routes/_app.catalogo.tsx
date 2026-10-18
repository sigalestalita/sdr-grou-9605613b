import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Pencil, Plus } from "lucide-react";
import { listarCatalogo, salvarProduto, type Produto } from "@/lib/catalogo.functions";
import { TIPO_LABEL } from "@/lib/catalogo/itens";
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

export const Route = createFileRoute("/_app/catalogo")({
  component: CatalogoPage,
  head: () => ({ meta: [{ title: "Catálogo | Grou Compass" }] }),
});

const MARCAS = ["PDA", "Talogy", "Self Guru"];

/**
 * Produtos e serviços com preço de tabela. Todo mundo consulta (o comercial
 * monta a proposta daqui); o Administrativo mantém. Item sem tipo não entra
 * na divisão produto × serviço da meta — o filtro "sem tipo" mostra o que
 * falta classificar (a maioria veio do RD).
 */
function CatalogoPage() {
  const fn = useServerFn(listarCatalogo);
  const { data, isLoading } = useQuery({ queryKey: ["catalogo"], queryFn: () => fn() });
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("");
  const [tipo, setTipo] = useState("");
  const [editando, setEditando] = useState<Produto | "novo" | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data?.produtos ?? []).filter(
      (p) =>
        (!q ||
          p.nome.toLowerCase().includes(q) ||
          (p.subcategoria ?? "").toLowerCase().includes(q)) &&
        (!marca || (marca === "-" ? !p.marca : p.marca === marca)) &&
        (!tipo || (tipo === "-" ? !p.tipo : p.tipo === tipo)),
    );
  }, [data, busca, marca, tipo]);
  const semTipo = (data?.produtos ?? []).filter((p) => p.ativo && !p.tipo).length;

  const selectCls = "h-8 rounded-md border bg-background px-2 text-xs";

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Package className="h-5 w-5" /> Catálogo
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Tabela de preço 2026 por marca e tipo. É o tipo que divide a meta em produto e serviço.
          </p>
        </div>
        {data?.podeEditar && (
          <Button size="sm" onClick={() => setEditando("novo")}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Novo item
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar"
          className="h-8 w-56 text-xs"
        />
        <select className={selectCls} value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="">Todas as marcas</option>
          {MARCAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="-">Sem marca</option>
        </select>
        <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Produto e serviço</option>
          <option value="produto">Produto</option>
          <option value="servico">Serviço</option>
          <option value="-">Sem tipo</option>
        </select>
        {semTipo > 0 && (
          <button
            type="button"
            onClick={() => setTipo("-")}
            className="text-[12px] text-amber-700 hover:underline dark:text-amber-400"
          >
            {semTipo} item(ns) sem tipo
          </button>
        )}
      </div>

      <section className="surface-panel overflow-x-auto p-3">
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Item</th>
                <th className="py-1 pr-2">Marca</th>
                <th className="py-1 pr-2">Tipo</th>
                <th className="py-1 pr-2">Subcategoria</th>
                <th className="py-1 pr-2 text-right">Preço de tabela</th>
                <th className="py-1 pr-2">Parcela até</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={`border-t ${p.ativo ? "" : "opacity-50"}`}>
                  <td className="py-1 pr-2 font-medium">{p.nome}</td>
                  <td className="py-1 pr-2">{p.marca ?? "—"}</td>
                  <td className="py-1 pr-2">
                    {p.tipo ? (
                      <Badge variant="outline" className="text-[10px]">
                        {TIPO_LABEL[p.tipo]}
                      </Badge>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">sem tipo</span>
                    )}
                  </td>
                  <td className="py-1 pr-2">{p.subcategoria ?? "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {p.preco_tabela != null ? moeda(p.preco_tabela) : "consultar"}
                  </td>
                  <td className="py-1 pr-2">
                    {p.parcelamento_max ? `${p.parcelamento_max}x` : "—"}
                  </td>
                  <td className="py-1 text-right">
                    {data?.podeEditar && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditando(p)}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editando && (
        <ProdutoDialog
          produto={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function ProdutoDialog({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarProduto);
  const [f, setF] = useState({
    nome: produto?.nome ?? "",
    marca: produto?.marca ?? "",
    tipo: produto?.tipo ?? "",
    subcategoria: produto?.subcategoria ?? "",
    descricao: produto?.descricao ?? "",
    preco: produto?.preco_tabela?.toString() ?? "",
    parcelas: produto?.parcelamento_max?.toString() ?? "",
    ativo: produto?.ativo ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          id: produto?.id,
          nome: f.nome.trim(),
          marca: f.marca.trim() || null,
          tipo: (f.tipo || null) as "produto" | "servico" | null,
          subcategoria: f.subcategoria.trim() || null,
          descricao: f.descricao.trim() || null,
          preco_tabela: f.preco.trim() === "" ? null : Number(f.preco.replace(",", ".")),
          parcelamento_max: f.parcelas.trim() === "" ? null : Number(f.parcelas),
          ativo: f.ativo,
        },
      }),
    onSuccess: () => {
      toast.success("Item salvo");
      qc.invalidateQueries({ queryKey: ["catalogo"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const selectCls = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{produto ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>
            O tipo decide em qual meta (produto ou serviço) o item conta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Nome</Label>
            <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Marca</Label>
              <select
                className={selectCls}
                value={f.marca}
                onChange={(e) => set("marca", e.target.value)}
              >
                <option value="">—</option>
                {MARCAS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Tipo</Label>
              <select
                className={selectCls}
                value={f.tipo}
                onChange={(e) => set("tipo", e.target.value)}
              >
                <option value="">Sem tipo</option>
                <option value="produto">Produto</option>
                <option value="servico">Serviço</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Subcategoria</Label>
              <Input
                value={f.subcategoria}
                onChange={(e) => set("subcategoria", e.target.value)}
                placeholder="Certificação in company"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Preço de tabela</Label>
              <Input
                inputMode="decimal"
                value={f.preco}
                onChange={(e) => set("preco", e.target.value)}
                placeholder="consultar"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Parcela em até</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={f.parcelas}
                onChange={(e) => set("parcelas", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Descrição</Label>
            <Textarea
              rows={2}
              value={f.descricao}
              onChange={(e) => set("descricao", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={f.ativo}
              onChange={(e) => set("ativo", e.target.checked)}
            />
            Ativo (aparece para montar proposta)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={f.nome.trim().length < 2 || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
