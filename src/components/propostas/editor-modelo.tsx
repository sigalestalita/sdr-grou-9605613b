import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, History, Plus, Trash2 } from "lucide-react";
import {
  itensDoModelo,
  ligarItensAoModelo,
  salvarModelo,
  versoesDoModelo,
  type ModeloEntrada,
} from "@/lib/propostas.functions";
import { montarConteudo, VARIAVEIS, variaveisDesconhecidas } from "@/lib/propostas/render";
import { DocumentoProposta } from "./documento-proposta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const MODELO_VAZIO: ModeloEntrada = {
  nome: "",
  descricao: null,
  cor: "#f08a24",
  titulo: "Proposta Comercial",
  introducao:
    "A/C: {{contato.nome}} | {{empresa.nome}}\nSeguem abaixo as condições da proposta comercial detalhada para sua avaliação:",
  condicoes:
    "**CONDIÇÕES GERAIS**\nForma de pagamento: {{pagamento}}\nValidade da proposta: {{validade}}",
  secoes: [
    { titulo: "Objeto e Recursos", corpo: "" },
    { titulo: "Termos de compra", corpo: "" },
  ],
  rodape:
    "**DADOS GROU:**\nGROU INOVAÇÃO PARA GESTÃO DE PESSOAS LTDA, pessoa jurídica de direito privado, regularmente inscrita no CNPJ sob o nº 06.934.208/0001-64, com sede na Avenida Sen. Tarso Dutra, nº 605, sala 1501, Bairro Petrópolis, Porto Alegre/RS, CEP 90690-140.",
  codigo_nfse: null,
  validade_dias: 10,
  padrao: false,
  ativo: true,
};

const EXEMPLO = {
  hoje: new Date().toISOString().slice(0, 10),
  pagamento: "À vista ou em até 3x sem juros no boleto",
  observacoes: "",
  impostos: 0,
  negocio: "Empresa Exemplo 2026",
  cliente: {
    empresa: "Empresa Exemplo",
    contato: "Maria Silva",
    cargo: "Gerente de RH",
    cnpj: null,
  },
  executivo: { nome: "Executivo Grou", email: null },
  itens: [{ nome: "Licença PDA 50", quantidade: 1, valor_unitario: 9702 }],
};

/**
 * Editor de modelo: texto à esquerda, prévia à direita com dados de exemplo.
 * Salvar guarda a versão anterior no histórico; propostas já geradas não mudam.
 */
export function EditorModelo({
  id,
  inicial,
  origem = "manual",
  podeEditar,
  onClose,
}: {
  id: string | null;
  inicial: ModeloEntrada;
  origem?: "manual" | "duplicado" | "importado";
  podeEditar: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarModelo);
  const [m, setM] = useState<ModeloEntrada>(inicial);
  const [historico, setHistorico] = useState(false);
  const [itens, setItens] = useState(false);
  const set = <K extends keyof ModeloEntrada>(k: K, v: ModeloEntrada[K]) =>
    setM((x) => ({ ...x, [k]: v }));

  const previa = useMemo(() => {
    try {
      return montarConteudo(
        [
          {
            id: "previa",
            nome: m.nome,
            versao: 1,
            cor: m.cor,
            titulo: m.titulo,
            introducao: m.introducao,
            condicoes: m.condicoes,
            secoes: m.secoes,
            rodape: m.rodape,
            codigo_nfse: m.codigo_nfse ?? null,
          },
        ],
        { ...EXEMPLO, validadeDias: m.validade_dias },
      );
    } catch {
      return null;
    }
  }, [m]);

  const desconhecidas = useMemo(
    () =>
      variaveisDesconhecidas(
        [
          m.titulo,
          m.introducao,
          m.condicoes,
          m.rodape,
          ...m.secoes.flatMap((s) => [s.titulo, s.corpo]),
        ].join("\n"),
      ),
    [m],
  );

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { id, origem, modelo: m } }),
    onSuccess: () => {
      toast.success(id ? "Modelo salvo (versão anterior no histórico)" : "Modelo criado");
      qc.invalidateQueries({ queryKey: ["proposta-modelos"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const secao = (i: number, patch: Partial<{ titulo: string; corpo: string }>) =>
    set(
      "secoes",
      m.secoes.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.secoes.length) return;
    const nova = [...m.secoes];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    set("secoes", nova);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[94vh] max-w-[1400px] flex-col gap-0 p-0 sm:max-w-[96vw]">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-3">
          <DialogTitle className="text-base">
            {id
              ? `Editar modelo · ${inicial.nome}`
              : origem === "importado"
                ? "Modelo importado — revise"
                : "Novo modelo"}
          </DialogTitle>
          <div className="flex items-center gap-2 pr-8">
            {id && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setItens(true)}>
                  Itens do catálogo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHistorico(true)}>
                  <History className="mr-1 h-3.5 w-3.5" /> Histórico
                </Button>
              </>
            )}
            <Button
              size="sm"
              disabled={!podeEditar || !m.nome.trim() || salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-h-0 space-y-4 overflow-y-auto border-r p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Campo rotulo="Nome do modelo">
                <Input
                  value={m.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="Ex.: Licença PDA"
                />
              </Campo>
              <Campo rotulo="Cor da faixa">
                <input
                  type="color"
                  className="h-9 w-16 cursor-pointer rounded border bg-background"
                  value={m.cor}
                  onChange={(e) => set("cor", e.target.value)}
                />
              </Campo>
            </div>
            <Campo rotulo="Para que serve (só aparece aqui)">
              <Input
                value={m.descricao ?? ""}
                onChange={(e) => set("descricao", e.target.value || null)}
              />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Título">
                <Input value={m.titulo} onChange={(e) => set("titulo", e.target.value)} />
              </Campo>
              <Campo rotulo="Validade padrão (dias)">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={m.validade_dias}
                  onChange={(e) => set("validade_dias", Number(e.target.value) || 1)}
                />
              </Campo>
              <Campo rotulo="Código NFS-e">
                <Input
                  value={m.codigo_nfse ?? ""}
                  onChange={(e) => set("codigo_nfse", e.target.value || null)}
                  placeholder="1.05"
                />
              </Campo>
            </div>
            <Campo rotulo="Introdução (antes das condições)">
              <Textarea
                rows={3}
                value={m.introducao}
                onChange={(e) => set("introducao", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Condições gerais">
              <Textarea
                rows={4}
                value={m.condicoes}
                onChange={(e) => set("condicoes", e.target.value)}
              />
            </Campo>
            <p className="text-[11px] text-muted-foreground">
              Depois das condições entra a tabela de itens e o total, sempre do negócio.
            </p>
            {m.secoes.map((s, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={s.titulo}
                    onChange={(e) => secao(i, { titulo: e.target.value })}
                    className="font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    title="Subir"
                    className="text-muted-foreground"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    title="Descer"
                    className="text-muted-foreground"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "secoes",
                        m.secoes.filter((_, j) => j !== i),
                      )
                    }
                    title="Remover seção"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Textarea
                  rows={10}
                  value={s.corpo}
                  onChange={(e) => secao(i, { corpo: e.target.value })}
                  className="font-mono text-[12px]"
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => set("secoes", [...m.secoes, { titulo: "Nova seção", corpo: "" }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Seção
            </Button>
            <Campo rotulo="Rodapé (dados da Grou, NFS-e, fechamento)">
              <Textarea rows={5} value={m.rodape} onChange={(e) => set("rodape", e.target.value)} />
            </Campo>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={m.padrao} onCheckedChange={(v) => set("padrao", v)} /> Modelo
                padrão (itens sem modelo)
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Switch checked={m.ativo} onCheckedChange={(v) => set("ativo", v)} /> Ativo
              </label>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Como escrever</p>
              <p>
                Linha em branco separa parágrafos · "- " no começo vira item de lista · **texto**
                fica em negrito.
              </p>
              <p className="mt-1">
                Variáveis:{" "}
                {VARIAVEIS.map((v) => (
                  <code key={v.chave} className="mr-1.5 inline-block" title={v.descricao}>
                    {`{{${v.chave}}}`}
                  </code>
                ))}
              </p>
              {desconhecidas.length > 0 && (
                <p className="mt-1 text-destructive">
                  Variável desconhecida: {desconhecidas.map((v) => `{{${v}}}`).join(", ")}
                </p>
              )}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto bg-[#eceef1] p-5">
            <p className="mb-2 text-[11px] text-muted-foreground">Prévia com dados de exemplo</p>
            {previa && (
              <div className="overflow-hidden rounded-lg shadow-sm">
                <DocumentoProposta c={previa} />
              </div>
            )}
          </div>
        </div>
        {historico && id && (
          <HistoricoModelo
            id={id}
            onRestaurar={(v) => setM(v)}
            onClose={() => setHistorico(false)}
          />
        )}
        {itens && id && <ItensDoModelo id={id} nome={m.nome} onClose={() => setItens(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{rotulo}</Label>
      {children}
    </div>
  );
}

function HistoricoModelo({
  id,
  onRestaurar,
  onClose,
}: {
  id: string;
  onRestaurar: (m: ModeloEntrada) => void;
  onClose: () => void;
}) {
  const fn = useServerFn(versoesDoModelo);
  const { data } = useQuery({
    queryKey: ["modelo-versoes", id],
    queryFn: () => fn({ data: { id } }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Versões anteriores</DialogTitle>
        </DialogHeader>
        {(data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Ainda não há versões anteriores.</p>
        ) : (
          <ul className="space-y-2">
            {(data ?? []).map((v) => (
              <li
                key={v.versao}
                className="flex items-center justify-between rounded-md border p-2 text-[13px]"
              >
                <span>
                  Versão {v.versao} · {new Date(v.created_at).toLocaleString("pt-BR")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onRestaurar({ ...MODELO_VAZIO, ...v.conteudo });
                    toast.info("Versão carregada no editor. Salve para aplicar.");
                    onClose();
                  }}
                >
                  Usar esta
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItensDoModelo({ id, nome, onClose }: { id: string; nome: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(itensDoModelo);
  const salvarFn = useServerFn(ligarItensAoModelo);
  const { data } = useQuery({
    queryKey: ["itens-do-modelo", id],
    queryFn: () => fn({ data: { id } }),
  });
  const [marcados, setMarcados] = useState<Set<string> | null>(null);
  const atual = marcados ?? new Set((data ?? []).filter((i) => i.doModelo).map((i) => i.id));
  const grupos = useMemo(() => {
    const g = new Map<string, NonNullable<typeof data>>();
    for (const i of data ?? []) g.set(i.grupo, [...(g.get(i.grupo) ?? []), i]);
    return [...g.entries()];
  }, [data]);
  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { id, produtos: [...atual] } }),
    onSuccess: () => {
      toast.success("Itens atualizados");
      qc.invalidateQueries({ queryKey: ["proposta-modelos"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Itens que usam “{nome}”</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-muted-foreground">
          Quando o negócio tem um destes itens, a proposta já sugere este modelo. Item marcado em
          outro modelo passa para este.
        </p>
        {grupos.map(([g, lista]) => (
          <div key={g} className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground">{g}</p>
            {lista.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={atual.has(i.id)}
                  onChange={(e) => {
                    const n = new Set(atual);
                    if (e.target.checked) n.add(i.id);
                    else n.delete(i.id);
                    setMarcados(n);
                  }}
                />
                {i.nome}
                {i.outroModelo && !atual.has(i.id) && (
                  <span className="text-[10px] text-muted-foreground">(em outro modelo)</span>
                )}
              </label>
            ))}
          </div>
        ))}
        <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
          Salvar itens
        </Button>
      </DialogContent>
    </Dialog>
  );
}
