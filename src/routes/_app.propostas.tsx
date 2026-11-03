import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, FilePlus2, FileText, Pencil, Sparkles, Upload } from "lucide-react";
import {
  duplicarModelo,
  importarModelo,
  listarModelos,
  listarPropostas,
  type ModeloEntrada,
} from "@/lib/propostas.functions";
import { dataBr, moedaBr, STATUS_PROPOSTA } from "@/lib/propostas/render";
import { EditorModelo, MODELO_VAZIO } from "@/components/propostas/editor-modelo";
import { ListaFichas } from "@/components/fichas/lista-fichas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/propostas")({
  validateSearch: (s: Record<string, unknown>): { aba?: "propostas" | "modelos" | "fichas" } =>
    s.aba === "modelos" || s.aba === "fichas" || s.aba === "propostas" ? { aba: s.aba } : {},
  component: PropostasPage,
  head: () => ({ meta: [{ title: "Propostas | Grou Compass" }] }),
});

/**
 * Todas as propostas (status, abertura, aceite) e os modelos de texto.
 * A proposta em si nasce no negócio; aqui é acompanhamento e modelos.
 */
function PropostasPage() {
  const { aba: abaUrl } = Route.useSearch();
  const [aba, setAba] = useState<"propostas" | "modelos" | "fichas">(abaUrl ?? "propostas");
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileText className="h-5 w-5" /> Propostas
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Geradas no negócio a partir dos itens e do modelo; o cliente abre pelo link, baixa o PDF
            e dá o aceite.
          </p>
        </div>
        <div className="flex rounded-full bg-muted p-1 text-[13px]">
          {(["propostas", "modelos", "fichas"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className={`rounded-full px-4 py-1.5 ${aba === a ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
            >
              {a === "propostas" ? "Propostas" : a === "modelos" ? "Modelos" : "Fichas cadastrais"}
            </button>
          ))}
        </div>
      </header>
      {aba === "propostas" ? <ListaPropostas /> : aba === "modelos" ? <Modelos /> : <ListaFichas />}
    </div>
  );
}

function ListaPropostas() {
  const fn = useServerFn(listarPropostas);
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["propostas", "todas", status],
    queryFn: () => fn({ data: status ? { status } : {} }),
  });
  const lista = useMemo(() => data ?? [], [data]);
  const resumo = useMemo(() => {
    const r = { abertas: 0, valorAberto: 0, aceitas: 0, valorAceito: 0 };
    for (const p of lista) {
      if (["enviada", "visualizada"].includes(p.status)) {
        r.abertas++;
        r.valorAberto += p.valorFinal;
      }
      if (p.status === "aceita") {
        r.aceitas++;
        r.valorAceito += p.valorFinal;
      }
    }
    return r;
  }, [lista]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-panel p-4">
          <p className="section-label">Esperando o cliente</p>
          <p className="mt-1 text-2xl font-semibold">{resumo.abertas}</p>
          <p className="text-[12px] text-muted-foreground">{moedaBr(resumo.valorAberto)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="section-label">Aceitas</p>
          <p className="mt-1 text-2xl font-semibold">{resumo.aceitas}</p>
          <p className="text-[12px] text-muted-foreground">{moedaBr(resumo.valorAceito)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          "",
          "rascunho",
          "enviada",
          "visualizada",
          "aceita",
          "recusada",
          "substituida",
          "cancelada",
        ].map((s) => (
          <button
            key={s || "todas"}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-[12px] ${status === s ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            {s ? STATUS_PROPOSTA[s].rotulo : "Todas"}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Nenhuma proposta. Gere a primeira dentro de um negócio, na seção “Propostas”.
        </p>
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Empresa · negócio</th>
                <th className="px-3 py-2">Modelo</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Por</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const st = STATUS_PROPOSTA[p.status] ?? STATUS_PROPOSTA.rascunho;
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 tabular-nums">
                      {p.numero}
                      <span className="text-muted-foreground"> v{p.versao}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/negocio/$id"
                        params={{ id: p.dealId }}
                        className="font-medium hover:underline"
                      >
                        {p.empresa ?? "—"}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground">{p.negocio}</span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">
                      {p.modelos.join(" + ")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{moedaBr(p.valorFinal)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tom}`}
                      >
                        {st.rotulo}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">
                      {p.aceitaEm
                        ? `aceita ${new Date(p.aceitaEm).toLocaleDateString("pt-BR")} · ${p.aceite?.nome ?? ""}`
                        : p.visualizadaEm
                          ? `aberta ${p.visualizacoes}×`
                          : p.enviadaEm
                            ? `enviada ${new Date(p.enviadaEm).toLocaleDateString("pt-BR")}`
                            : `criada ${new Date(p.criadaEm).toLocaleDateString("pt-BR")}`}
                      {p.validadeAte && ["enviada", "visualizada"].includes(p.status) && (
                        <span className="block">até {dataBr(p.validadeAte)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">
                      {p.autor ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Edicao = {
  id: string | null;
  inicial: ModeloEntrada;
  origem: "manual" | "duplicado" | "importado";
};

function Modelos() {
  const qc = useQueryClient();
  const fn = useServerFn(listarModelos);
  const duplicarFn = useServerFn(duplicarModelo);
  const { data, isLoading } = useQuery({ queryKey: ["proposta-modelos"], queryFn: () => fn() });
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [importando, setImportando] = useState(false);
  const pode = !!data?.podeEditar;

  const duplicar = useMutation({
    mutationFn: (id: string) => duplicarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cópia criada — edite e renomeie");
      qc.invalidateQueries({ queryKey: ["proposta-modelos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-4">
      {pode && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setEdicao({ id: null, inicial: MODELO_VAZIO, origem: "manual" })}
          >
            <FilePlus2 className="mr-1 h-3.5 w-3.5" /> Novo do zero
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportando(true)}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Importar de print, arquivo ou texto
          </Button>
        </div>
      )}
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.modelos ?? []).map((m) => (
            <div
              key={m.id}
              className={`surface-panel flex flex-col gap-2 p-4 ${m.ativo ? "" : "opacity-60"}`}
            >
              <div className="h-1 w-12 rounded-full" style={{ background: m.cor }} />
              <div>
                <p className="font-semibold">
                  {m.nome}
                  {m.padrao && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                      PADRÃO
                    </span>
                  )}
                  {!m.ativo && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                      INATIVO
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-muted-foreground">{m.descricao ?? "—"}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {(m.secoes as unknown[]).length} seções · {m.itensNoCatalogo} itens do catálogo ·
                versão {m.versao}
                {m.codigo_nfse ? ` · NFS-e ${m.codigo_nfse}` : ""}
              </p>
              <div className="mt-auto flex gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEdicao({
                      id: m.id,
                      origem: "manual",
                      inicial: {
                        nome: m.nome,
                        descricao: m.descricao ?? null,
                        cor: m.cor,
                        titulo: m.titulo,
                        introducao: m.introducao,
                        condicoes: m.condicoes,
                        secoes: m.secoes,
                        rodape: m.rodape,
                        codigo_nfse: m.codigo_nfse ?? null,
                        validade_dias: m.validade_dias,
                        padrao: m.padrao,
                        ativo: m.ativo,
                      },
                    })
                  }
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" /> {pode ? "Editar" : "Ver"}
                </Button>
                {pode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={duplicar.isPending}
                    onClick={() => duplicar.mutate(m.id)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {edicao && (
        <EditorModelo
          key={edicao.id ?? "novo"}
          id={edicao.id}
          inicial={edicao.inicial}
          origem={edicao.origem}
          podeEditar={pode}
          onClose={() => setEdicao(null)}
        />
      )}
      {importando && (
        <ImportarDialog
          onClose={() => setImportando(false)}
          onPronto={(m) => {
            setImportando(false);
            setEdicao({ id: null, inicial: m, origem: "importado" });
          }}
        />
      )}
    </div>
  );
}

const MAX_ARQ = 6 * 1024 * 1024;

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(r.error);
    if (f.type.startsWith("text/") || /\.(txt|md|html?)$/i.test(f.name)) r.readAsText(f);
    else r.readAsDataURL(f);
  });
}

function ImportarDialog({
  onClose,
  onPronto,
}: {
  onClose: () => void;
  onPronto: (m: ModeloEntrada) => void;
}) {
  const fn = useServerFn(importarModelo);
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const ler = useMutation({
    mutationFn: async () => {
      let t = texto;
      const binarios: Array<{ nome: string; tipo: string; dataUrl: string }> = [];
      for (const f of arquivos) {
        if (f.size > MAX_ARQ) throw new Error(`${f.name} passa de 6 MB`);
        const conteudo = await lerArquivo(f);
        if (conteudo.startsWith("data:"))
          binarios.push({ nome: f.name, tipo: f.type, dataUrl: conteudo });
        else t += `\n\n${conteudo}`;
      }
      return fn({ data: { texto: t, arquivos: binarios } });
    },
    onSuccess: (m) => {
      toast.success("Modelo lido — revise antes de salvar");
      onPronto(m);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar modelo</DialogTitle>
          <DialogDescription>
            Prints de uma proposta (em ordem), um PDF, ou o texto colado. A IA copia o texto, tira a
            tabela de preços (que vem do negócio) e troca os dados do cliente por variáveis. Você
            revisa antes de salvar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-5 text-center text-[13px] text-muted-foreground hover:border-primary">
            <Upload className="h-5 w-5" />
            {arquivos.length
              ? `${arquivos.length} arquivo(s): ${arquivos.map((a) => a.name).join(", ")}`
              : "Escolher prints, PDF ou .txt"}
            <input
              type="file"
              multiple
              accept="image/*,application/pdf,.txt,.md,.html"
              className="hidden"
              onChange={(e) => setArquivos(Array.from(e.target.files ?? []).slice(0, 8))}
            />
          </label>
          <Textarea
            rows={7}
            placeholder="…ou cole aqui o texto da proposta (do RD, Word, PPT)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Word e PowerPoint: copie e cole o texto.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={ler.isPending || (!texto.trim() && arquivos.length === 0)}
            onClick={() => ler.mutate()}
          >
            {ler.isPending ? "Lendo… (até 1 min)" : "Ler e montar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
