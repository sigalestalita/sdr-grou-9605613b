import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download,
  FileUp,
  Filter,
  List,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  apagarSegmento,
  buscarEmpresasSegmento,
  exportarSegmento,
  importarListaDeEmails,
  listarSegmentos,
  opcoesDeSegmentacao,
  previaSegmento,
  salvarSegmento,
  valoresDoCampo,
  type Regras,
} from "@/lib/email-marketing.functions";
import { CAMPOS_SEGMENTO, OPERADORES } from "@/lib/email-marketing/campos";
import { lerListaDeEmails, MAX_CONTATOS_NA_LISTA } from "@/lib/email-marketing/lista";
import { downloadCsv } from "@/lib/export-csv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_app/email-marketing/segmentos")({
  component: SegmentosPage,
  head: () => ({ meta: [{ title: "Segmentações | Grou Compass" }] }),
});

const REGRAS_VAZIAS: Regras = {
  base: "todos",
  origens: [],
  tipos: [],
  etapas: [],
  prioridades: [],
  responsaveis: [],
  carteiras: [],
  lista: null,
  sinaleiras: [],
  cliente: "",
  campanha_contem: "",
  conversao_contem: "",
  email_contem: "",
  converteu_desde: "",
  criado_desde: "",
  criado_ate: "",
  empresas: [],
  condicoes: [],
};
const TIPOS = [
  { valor: "empresa", rotulo: "Empresa" },
  { valor: "consultoria", rotulo: "Consultoria" },
  { valor: "pessoa_fisica", rotulo: "Pessoa física" },
];
const PRIORIDADES = [
  { valor: "frio", rotulo: "Frio" },
  { valor: "morno", rotulo: "Morno" },
  { valor: "quente", rotulo: "Quente" },
];
const SINALEIRAS = [
  { valor: "verde", rotulo: "Verde" },
  { valor: "amarelo", rotulo: "Amarelo" },
  { valor: "vermelho", rotulo: "Vermelho" },
  { valor: "preto", rotulo: "Preto" },
  { valor: "sem_dado", rotulo: "Sem dado" },
];
const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";

type Edicao = {
  id: string | null;
  /** "lista": segmentação por lista subida (planilha/colagem), sem regras. */
  tipo: "regras" | "lista";
  nome: string;
  descricao: string;
  regras: Regras;
};
const NOVA: Edicao = { id: null, tipo: "regras", nome: "", descricao: "", regras: REGRAS_VAZIAS };
const NOVA_LISTA: Edicao = { ...NOVA, tipo: "lista" };
type ListaEmEdicao = { texto: string; modo: "substituir" | "adicionar" };
const LISTA_VAZIA: ListaEmEdicao = { texto: "", modo: "adicionar" };

function SegmentosPage() {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarSegmentos);
  const opcoesFn = useServerFn(opcoesDeSegmentacao);
  const salvarFn = useServerFn(salvarSegmento);
  const importarFn = useServerFn(importarListaDeEmails);
  const exportarFn = useServerFn(exportarSegmento);
  const apagarFn = useServerFn(apagarSegmento);

  const { data: segmentos, isLoading } = useQuery({
    queryKey: ["email-mkt", "segmentos"],
    queryFn: () => listarFn(),
  });
  const { data: opcoes } = useQuery({
    queryKey: ["email-mkt", "opcoes-segmentacao"],
    queryFn: () => opcoesFn(),
    staleTime: 5 * 60_000,
  });

  const [ed, setEdicao] = useState<Edicao>(NOVA);
  const [lista, setLista] = useState<ListaEmEdicao>(LISTA_VAZIA);
  const leitura = useMemo(() => lerListaDeEmails(lista.texto), [lista.texto]);
  // Trocar de segmentação descarta a lista colada e não salva.
  const setEd: typeof setEdicao = (v) => {
    setEdicao(v);
    if (typeof v !== "function") setLista(LISTA_VAZIA);
  };
  const setRegra = <K extends keyof Regras>(k: K, v: Regras[K]) =>
    setEd((e) => ({ ...e, regras: { ...e.regras, [k]: v } }));

  const abrir = (id: string) => {
    const s = segmentos?.find((x) => x.id === id);
    if (!s) return;
    setEd({
      id: s.id,
      tipo: s.regras?.lista ? "lista" : "regras",
      nome: s.nome,
      descricao: s.descricao ?? "",
      regras: { ...REGRAS_VAZIAS, ...(s.regras ?? {}) },
    });
  };

  const salvar = useMutation({
    mutationFn: () => {
      if (!ed.nome.trim()) throw new Error("Dê um nome à segmentação");
      if (ed.tipo === "lista") {
        if (!ed.id && !leitura.contatos.length)
          throw new Error("Cole a lista ou escolha o arquivo antes de salvar");
        if (leitura.contatos.length > MAX_CONTATOS_NA_LISTA)
          throw new Error(
            `A lista passa de ${MAX_CONTATOS_NA_LISTA.toLocaleString("pt-BR")} e-mails; divida em partes`,
          );
        return importarFn({
          data: {
            id: ed.id,
            nome: ed.nome.trim(),
            descricao: ed.descricao.trim() || null,
            modo: lista.modo,
            contatos: leitura.contatos,
          },
        });
      }
      return salvarFn({
        data: {
          id: ed.id,
          nome: ed.nome.trim(),
          descricao: ed.descricao.trim() || null,
          regras: ed.regras,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Segmentação salva · ${r.total.toLocaleString("pt-BR")} contatos`);
      setEdicao((e) => ({
        ...e,
        id: r.id,
        regras: e.tipo === "lista" ? { ...REGRAS_VAZIAS, lista: r.id } : e.regras,
      }));
      setLista(LISTA_VAZIA);
      qc.invalidateQueries({ queryKey: ["email-mkt", "previa-segmento"] });
      qc.invalidateQueries({ queryKey: ["email-mkt", "segmentos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  // Baixa quem entra (todos, não só a amostra), já sem descadastrados.
  const baixar = useMutation({
    mutationFn: async () => {
      const lidosSemSalvar = ed.tipo === "lista" && (!ed.id || lista.texto.trim());
      if (lidosSemSalvar) return leitura.contatos;
      const regras = ed.tipo === "lista" ? { ...REGRAS_VAZIAS, lista: ed.id } : ed.regras;
      return exportarFn({ data: { regras } });
    },
    onSuccess: (linhas) => {
      if (!linhas.length) {
        toast.info("Ninguém nesta segmentação para baixar");
        return;
      }
      const nome =
        (ed.nome.trim() || "segmentacao")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "segmentacao";
      downloadCsv(
        `${nome}-${new Date().toISOString().slice(0, 10)}.csv`,
        linhas.map((l) => ({ "E-mail": l.email, Nome: l.nome ?? "", Empresa: l.empresa ?? "" })),
        ["E-mail", "Nome", "Empresa"],
      );
      toast.success(`${linhas.length.toLocaleString("pt-BR")} contatos baixados`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao baixar"),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => apagarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Segmentação apagada");
      setEd(NOVA);
      qc.invalidateQueries({ queryKey: ["email-mkt", "segmentos"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-6">
      {/* Lista */}
      <Card className="h-fit overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="section-label">Segmentações</p>
          <div className="flex gap-0.5">
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEd(NOVA)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Nova
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setEd(NOVA_LISTA)}
              title="Subir uma lista de e-mails (planilha ou colagem)"
            >
              <Upload className="mr-1 h-3.5 w-3.5" /> Lista
            </Button>
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto lg:max-h-[calc(100vh-200px)]">
          {isLoading ? (
            <p className="p-3 text-[12px] text-muted-foreground">Carregando…</p>
          ) : !segmentos?.length ? (
            <p className="p-3 text-[12px] text-muted-foreground">
              Nenhuma ainda. Monte as regras ao lado e salve.
            </p>
          ) : (
            segmentos.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => abrir(s.id)}
                className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-[13px] last:border-0 hover:bg-muted/50 ${ed.id === s.id ? "bg-primary/10" : ""}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1 truncate font-medium">
                    {s.regras?.lista && (
                      <List className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Lista" />
                    )}
                    <span className="truncate">{s.nome}</span>
                  </span>
                  {s.descricao && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.descricao}
                    </span>
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums">
                  {s.ultima_contagem != null ? s.ultima_contagem.toLocaleString("pt-BR") : "—"}
                </span>
              </button>
            ))
          )}
        </div>
      </Card>

      {/* Editor */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                {ed.tipo === "lista" ? (
                  <List className="h-4 w-4" />
                ) : (
                  <Filter className="h-4 w-4" />
                )}{" "}
                {ed.tipo === "lista"
                  ? ed.id
                    ? "Editar lista"
                    : "Nova lista de e-mails"
                  : ed.id
                    ? "Editar segmentação"
                    : "Nova segmentação"}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  {salvar.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  )}
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEd(NOVA)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nova
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => baixar.mutate()}
                  disabled={baixar.isPending}
                  title="Baixar todos os contatos desta segmentação em CSV (abre no Excel)"
                >
                  {baixar.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5" />
                  )}
                  Baixar lista
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEd(NOVA_LISTA)}>
                  <Upload className="mr-1 h-3.5 w-3.5" /> Subir lista
                </Button>
                {ed.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={apagar.isPending}
                    onClick={() => {
                      if (ed.id && window.confirm(`Apagar a segmentação “${ed.nome}”?`))
                        apagar.mutate(ed.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome">
                <Input
                  value={ed.nome}
                  onChange={(e) => setEd({ ...ed, nome: e.target.value })}
                  maxLength={160}
                  placeholder={
                    ed.tipo === "lista"
                      ? "Ex.: Clientes do Maicon — convite evento"
                      : "Ex.: Leads de evento, últimos 6 meses"
                  }
                  className="text-[13px]"
                />
              </Campo>
              <Campo rotulo="Descrição (opcional)">
                <Input
                  value={ed.descricao}
                  onChange={(e) => setEd({ ...ed, descricao: e.target.value })}
                  maxLength={500}
                  className="text-[13px]"
                />
              </Campo>
            </div>
          </Card>

          {ed.tipo === "lista" ? (
            <ListaDeEmails
              existente={!!ed.id}
              lista={lista}
              onChange={setLista}
              leitura={leitura}
            />
          ) : (
            <>
              <Card className="space-y-4 p-4">
                <p className="section-label">Regras · todas precisam valer (E)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Base">
                    <select
                      className={SELECT}
                      value={ed.regras.base}
                      onChange={(e) => setRegra("base", e.target.value as Regras["base"])}
                    >
                      <option value="todos">Todos os contatos</option>
                      <option value="kanban">Só leads do kanban</option>
                      <option value="marketing">Só base de marketing</option>
                    </select>
                  </Campo>
                  <Campo rotulo="Cliente">
                    <select
                      className={SELECT}
                      value={ed.regras.cliente}
                      onChange={(e) => setRegra("cliente", e.target.value as Regras["cliente"])}
                    >
                      <option value="">Todos</option>
                      <option value="sim">Só clientes</option>
                      <option value="nao">Só não clientes</option>
                    </select>
                  </Campo>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Multi
                    rotulo="Origens"
                    busca
                    opcoes={(opcoes?.origens ?? []).map((o) => ({ valor: o, rotulo: o }))}
                    marcados={ed.regras.origens}
                    onChange={(v) => setRegra("origens", v)}
                  />
                  <Multi
                    rotulo="Etapas do kanban"
                    busca={(opcoes?.etapas.length ?? 0) > 8}
                    opcoes={(opcoes?.etapas ?? []).map((e) => ({ valor: e.slug, rotulo: e.name }))}
                    marcados={ed.regras.etapas}
                    onChange={(v) => setRegra("etapas", v)}
                  />
                  <div className="space-y-3">
                    <Multi
                      rotulo="Carteira do executivo"
                      ajuda="Contatos das empresas do executivo (carteira de CS ou dono no RD). Use para “os clientes do Fulano”."
                      busca={(opcoes?.pessoas.length ?? 0) > 8}
                      opcoes={(opcoes?.pessoas ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))}
                      marcados={ed.regras.carteiras}
                      onChange={(v) => setRegra("carteiras", v)}
                    />
                    <Multi
                      rotulo="Responsável pelo lead"
                      ajuda="Quem está com o lead no kanban do Compass."
                      busca={(opcoes?.pessoas.length ?? 0) > 8}
                      opcoes={(opcoes?.pessoas ?? []).map((p) => ({ valor: p.id, rotulo: p.nome }))}
                      marcados={ed.regras.responsaveis}
                      onChange={(v) => setRegra("responsaveis", v)}
                    />
                  </div>
                  <div className="space-y-3">
                    <Multi
                      rotulo="Tipo de lead"
                      opcoes={TIPOS}
                      marcados={ed.regras.tipos}
                      onChange={(v) => setRegra("tipos", v)}
                    />
                    <Multi
                      rotulo="Prioridade"
                      opcoes={PRIORIDADES}
                      marcados={ed.regras.prioridades}
                      onChange={(v) => setRegra("prioridades", v)}
                    />
                  </div>
                  <Multi
                    rotulo="Sinaleira (clientes)"
                    ajuda={
                      ed.regras.cliente === "sim" ? undefined : "Só faz sentido com “Só clientes”."
                    }
                    desativado={ed.regras.cliente === "nao"}
                    opcoes={SINALEIRAS}
                    marcados={ed.regras.sinaleiras}
                    onChange={(v) => setRegra("sinaleiras", v)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Campanha contém">
                    <Input
                      value={ed.regras.campanha_contem}
                      onChange={(e) => setRegra("campanha_contem", e.target.value)}
                      maxLength={120}
                      placeholder="Ex.: black-friday"
                      className="text-[13px]"
                    />
                  </Campo>
                  <Campo rotulo="Converteu em (evento contém)">
                    <Input
                      value={ed.regras.conversao_contem}
                      onChange={(e) => setRegra("conversao_contem", e.target.value)}
                      maxLength={120}
                      placeholder="Ex.: masterclass"
                      className="text-[13px]"
                    />
                  </Campo>
                  <Campo rotulo="Converteu desde">
                    <Input
                      type="date"
                      value={ed.regras.converteu_desde}
                      onChange={(e) => setRegra("converteu_desde", e.target.value)}
                      className="text-[13px]"
                    />
                  </Campo>
                  <Campo rotulo="E-mail contém (domínio)">
                    <Input
                      value={ed.regras.email_contem}
                      onChange={(e) => setRegra("email_contem", e.target.value)}
                      maxLength={120}
                      placeholder="Ex.: @empresa.com.br"
                      className="text-[13px]"
                    />
                  </Campo>
                  <Campo rotulo="Entrou entre">
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={ed.regras.criado_desde}
                        onChange={(e) => setRegra("criado_desde", e.target.value)}
                        className="min-w-0 text-[13px]"
                      />
                      <span className="text-[12px] text-muted-foreground">e</span>
                      <Input
                        type="date"
                        value={ed.regras.criado_ate}
                        onChange={(e) => setRegra("criado_ate", e.target.value)}
                        className="min-w-0 text-[13px]"
                      />
                    </div>
                  </Campo>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEd((e) => ({ ...e, regras: REGRAS_VAZIAS }))}
                  >
                    Limpar regras
                  </Button>
                </div>
              </Card>

              <Card className="space-y-3 p-4">
                <div>
                  <p className="section-label">Empresas específicas</p>
                  <p className="text-[12px] text-muted-foreground">
                    Só os contatos destas empresas. Deixe vazio para não filtrar por empresa.
                  </p>
                </div>
                <EmpresasEscolhidas
                  valor={ed.regras.empresas}
                  onChange={(v) => setRegra("empresas", v)}
                />
              </Card>

              <Card className="space-y-3 p-4">
                <div>
                  <p className="section-label">Campos do lead, do contato e da empresa</p>
                  <p className="text-[12px] text-muted-foreground">
                    Ex.: Cargo contém “RH”, Segmento da empresa é “Indústria”, Estado da empresa é
                    “RS”. Todas as condições precisam valer.
                  </p>
                </div>
                <CondicoesPorCampo
                  valor={ed.regras.condicoes}
                  onChange={(v) => setRegra("condicoes", v)}
                />
              </Card>
            </>
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          {ed.tipo === "lista" && (!ed.id || lista.texto.trim()) ? (
            <PreviaDaLista leitura={leitura} />
          ) : ed.tipo === "lista" && ed.id ? (
            <PreviaSegmento regras={{ ...REGRAS_VAZIAS, lista: ed.id }} />
          ) : (
            <PreviaSegmento regras={ed.regras} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmpresasEscolhidas({
  valor,
  onChange,
}: {
  valor: Regras["empresas"];
  onChange: (v: Regras["empresas"]) => void;
}) {
  const buscarFn = useServerFn(buscarEmpresasSegmento);
  const [termo, setTermo] = useState("");
  const [atrasado, setAtrasado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(termo.trim()), 350);
    return () => clearTimeout(t);
  }, [termo]);
  const { data: achadas, isFetching } = useQuery({
    queryKey: ["email-mkt", "empresas", atrasado],
    queryFn: () => buscarFn({ data: { termo: atrasado } }),
    enabled: atrasado.length >= 2,
  });
  const escolhidas = new Set(valor.map((e) => e.id));
  return (
    <div className="space-y-2">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[12px]"
            >
              {e.nome}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(valor.filter((x) => x.id !== e.id))}
                title="Tirar"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar empresa pelo nome…"
          className="pl-8 text-[13px]"
        />
      </div>
      {atrasado.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-md border">
          {isFetching && !achadas ? (
            <p className="p-2 text-[12px] text-muted-foreground">Buscando…</p>
          ) : !achadas?.length ? (
            <p className="p-2 text-[12px] text-muted-foreground">Nenhuma empresa com esse nome.</p>
          ) : (
            achadas.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-[13px] last:border-0 hover:bg-muted/50"
              >
                <Checkbox
                  checked={escolhidas.has(e.id)}
                  onCheckedChange={(v) =>
                    onChange(
                      v
                        ? [...valor, { id: e.id, nome: e.nome }]
                        : valor.filter((x) => x.id !== e.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                {e.local && <span className="text-[11px] text-muted-foreground">{e.local}</span>}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CondicoesPorCampo({
  valor,
  onChange,
}: {
  valor: Regras["condicoes"];
  onChange: (v: Regras["condicoes"]) => void;
}) {
  const muda = (i: number, patch: Partial<Regras["condicoes"][number]>) =>
    onChange(valor.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {valor.map((c, i) => (
        <LinhaCondicao
          key={i}
          c={c}
          muda={(p) => muda(i, p)}
          tirar={() => onChange(valor.filter((_, j) => j !== i))}
        />
      ))}
      {valor.length < 20 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...valor, { campo: "cargo", operador: "contem", valor: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar condição
        </Button>
      )}
    </div>
  );
}

function LinhaCondicao({
  c,
  muda,
  tirar,
}: {
  c: Regras["condicoes"][number];
  muda: (p: Partial<Regras["condicoes"][number]>) => void;
  tirar: () => void;
}) {
  const valoresFn = useServerFn(valoresDoCampo);
  const def = CAMPOS_SEGMENTO.find((x) => x.id === c.campo);
  const op = OPERADORES.find((o) => o.id === c.operador);
  const { data: sugestoes } = useQuery({
    queryKey: ["email-mkt", "valores", c.campo],
    queryFn: () => valoresFn({ data: { campo: c.campo as never } }),
    staleTime: 10 * 60_000,
    enabled: !!op?.valor,
  });
  const lista = `valores-${c.campo}`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <select
        className="h-9 min-w-[180px] flex-1 rounded-md border bg-background px-2 text-[13px]"
        value={c.campo}
        onChange={(e) => muda({ campo: e.target.value as never, valor: "" })}
      >
        {(["Lead", "Contato", "Empresa"] as const).map((g) => (
          <optgroup key={g} label={g}>
            {CAMPOS_SEGMENTO.filter((x) => x.grupo === g).map((x) => (
              <option key={x.id} value={x.id}>
                {x.rotulo}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <select
        className="h-9 rounded-md border bg-background px-2 text-[13px]"
        value={c.operador}
        onChange={(e) => muda({ operador: e.target.value as never })}
      >
        {OPERADORES.filter((o) => !("numero" in o) || def?.numero).map((o) => (
          <option key={o.id} value={o.id}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {op?.valor && (
        <>
          <Input
            list={lista}
            value={c.valor}
            onChange={(e) => muda({ valor: e.target.value })}
            placeholder={def?.numero ? "número" : "valor"}
            className="h-9 min-w-[160px] flex-1 text-[13px]"
            maxLength={200}
          />
          <datalist id={lista}>
            {(sugestoes ?? []).map((v) => (
              <option key={v.valor} value={v.valor}>
                {`${v.total.toLocaleString("pt-BR")} contatos`}
              </option>
            ))}
          </datalist>
        </>
      )}
      <button
        type="button"
        onClick={tirar}
        className="text-muted-foreground hover:text-destructive"
        title="Tirar condição"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function PreviaSegmento({ regras }: { regras: Regras }) {
  const fn = useServerFn(previaSegmento);
  const chave = JSON.stringify(regras);
  const [atrasada, setAtrasada] = useState(chave);
  useEffect(() => {
    const t = setTimeout(() => setAtrasada(chave), 600);
    return () => clearTimeout(t);
  }, [chave]);
  const { data, isFetching, error } = useQuery({
    queryKey: ["email-mkt", "previa-segmento", atrasada],
    queryFn: () => fn({ data: { regras: JSON.parse(atrasada) as Regras } }),
    placeholderData: keepPreviousData,
  });
  const calculando = isFetching || atrasada !== chave;

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <p className="section-label flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Quem entra
          {calculando && <Loader2 className="h-3 w-3 animate-spin" />}
        </p>
        {error ? (
          <p className="mt-1 text-[12px] text-destructive">
            {error instanceof Error ? error.message : "Erro na prévia"}
          </p>
        ) : (
          <>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${calculando ? "opacity-60" : ""}`}
            >
              {data ? data.total.toLocaleString("pt-BR") : "…"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              contatos com e-mail, já sem descadastrados
            </p>
          </>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {data?.amostra.length ? (
          data.amostra.map((a) => (
            <div key={a.email} className="border-b px-4 py-2 text-[12px] last:border-0">
              <p className="truncate font-medium">{a.nome || a.email}</p>
              <p className="truncate text-muted-foreground">
                {a.email}
                {a.empresa ? ` · ${a.empresa}` : ""}
              </p>
            </div>
          ))
        ) : data ? (
          <p className="p-4 text-[12px] text-muted-foreground">Ninguém com essas regras.</p>
        ) : null}
        {data && data.total > data.amostra.length && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground">
            Amostra de {data.amostra.length} de {data.total.toLocaleString("pt-BR")}.
          </p>
        )}
      </div>
    </Card>
  );
}

/** Lê .csv/.txt em UTF-8; se não for, em Windows-1252 (CSV salvo pelo Excel). */
async function lerArquivoDeTexto(f: File): Promise<string> {
  const bytes = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function ListaDeEmails({
  existente,
  lista,
  onChange,
  leitura,
}: {
  existente: boolean;
  lista: ListaEmEdicao;
  onChange: (v: ListaEmEdicao) => void;
  leitura: ReturnType<typeof lerListaDeEmails>;
}) {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const abrirArquivo = async (f: File | undefined) => {
    if (!f) return;
    if (/\.(xlsx?|ods|numbers)$/i.test(f.name)) {
      toast.error(
        "Planilha do Excel: selecione as colunas na planilha, copie e cole aqui — ou salve como CSV.",
      );
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Arquivo grande demais (máx. 8 MB)");
      return;
    }
    setArquivo(f.name);
    onChange({ ...lista, texto: await lerArquivoDeTexto(f) });
  };
  const n = leitura.contatos.length;
  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="section-label">Lista de e-mails</p>
        <p className="text-[12px] text-muted-foreground">
          Copie as colunas da planilha (e-mail, e se tiver, nome e empresa) e cole abaixo, ou
          escolha um arquivo .csv. Com cabeçalho, as colunas são achadas pelo nome. Descadastrados
          ficam de fora no envio.
        </p>
      </div>
      <textarea
        value={lista.texto}
        onChange={(e) => {
          setArquivo(null);
          onChange({ ...lista, texto: e.target.value });
        }}
        rows={10}
        spellCheck={false}
        placeholder={"E-mail\tNome\tEmpresa\nana@empresa.com.br\tAna Souza\tEmpresa X\n…"}
        className="w-full rounded-md border bg-background p-2 font-mono text-[12px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-3 text-[12px] font-medium hover:bg-muted/50">
          <FileUp className="h-3.5 w-3.5" /> Escolher arquivo .csv
          <input
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              void abrirArquivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {arquivo && <span className="text-[12px] text-muted-foreground">{arquivo}</span>}
        {lista.texto && (
          <button
            type="button"
            className="text-[12px] text-muted-foreground hover:underline"
            onClick={() => {
              setArquivo(null);
              onChange({ ...lista, texto: "" });
            }}
          >
            limpar
          </button>
        )}
      </div>
      {existente && (
        <div className="flex flex-wrap gap-4 text-[12px]">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={lista.modo === "adicionar"}
              onChange={() => onChange({ ...lista, modo: "adicionar" })}
            />
            Juntar à lista que já existe
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={lista.modo === "substituir"}
              onChange={() => onChange({ ...lista, modo: "substituir" })}
            />
            Trocar a lista inteira por esta
          </label>
        </div>
      )}
      {lista.texto.trim() && (
        <p className="text-[12px]">
          <span className="font-medium">{n.toLocaleString("pt-BR")} e-mails</span> prontos
          {leitura.repetidos > 0 && ` · ${leitura.repetidos} repetidos (entram uma vez)`}
          {leitura.invalidas.length > 0 && (
            <span className="text-destructive">
              {" "}
              · {leitura.invalidas.length} linhas sem e-mail válido
            </span>
          )}
          {n > MAX_CONTATOS_NA_LISTA && (
            <span className="text-destructive">
              {" "}
              · passa do máximo de {MAX_CONTATOS_NA_LISTA.toLocaleString("pt-BR")}
            </span>
          )}
          . Clique em Salvar para {existente ? "atualizar a lista" : "criar a segmentação"}.
        </p>
      )}
      {leitura.invalidas.length > 0 && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Ver linhas ignoradas</summary>
          <ul className="mt-1 max-h-32 overflow-y-auto font-mono">
            {leitura.invalidas.slice(0, 50).map((l, i) => (
              <li key={i} className="truncate">
                {l}
              </li>
            ))}
          </ul>
        </details>
      )}
      {existente && !lista.texto.trim() && (
        <p className="text-[12px] text-muted-foreground">
          Para mudar quem está na lista, cole ou escolha outra lista acima. Para só renomear, mude o
          nome e salve.
        </p>
      )}
    </Card>
  );
}

function PreviaDaLista({ leitura }: { leitura: ReturnType<typeof lerListaDeEmails> }) {
  const amostra = leitura.contatos.slice(0, 15);
  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <p className="section-label flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Na lista
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {leitura.contatos.length.toLocaleString("pt-BR")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          e-mails lidos (ainda não salvos; descadastrados saem ao salvar)
        </p>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {amostra.length ? (
          amostra.map((a) => (
            <div key={a.email} className="border-b px-4 py-2 text-[12px] last:border-0">
              <p className="truncate font-medium">{a.nome || a.email}</p>
              <p className="truncate text-muted-foreground">
                {a.email}
                {a.empresa ? ` · ${a.empresa}` : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="p-4 text-[12px] text-muted-foreground">
            Cole a lista ou escolha um arquivo.
          </p>
        )}
        {leitura.contatos.length > amostra.length && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground">
            Amostra de {amostra.length} de {leitura.contatos.length.toLocaleString("pt-BR")}.
          </p>
        )}
      </div>
    </Card>
  );
}

function Multi({
  rotulo,
  opcoes,
  marcados,
  onChange,
  busca = false,
  ajuda,
  desativado = false,
}: {
  rotulo: string;
  opcoes: Array<{ valor: string; rotulo: string }>;
  marcados: string[];
  onChange: (v: string[]) => void;
  busca?: boolean;
  ajuda?: string;
  desativado?: boolean;
}) {
  const [q, setQ] = useState("");
  const visiveis = useMemo(() => {
    const b = q.trim().toLowerCase();
    return b ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(b)) : opcoes;
  }, [opcoes, q]);
  // Marcados que a busca escondeu (ou que não estão mais nas opções) continuam visíveis.
  const escondidos = marcados.filter((m) => !visiveis.some((o) => o.valor === m));
  const rotuloDe = (v: string) => opcoes.find((o) => o.valor === v)?.rotulo ?? v;
  const alternar = (v: string, on: boolean) =>
    onChange(on ? [...marcados, v] : marcados.filter((x) => x !== v));

  return (
    <div className={`space-y-1 ${desativado ? "pointer-events-none opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">
          {rotulo}
          {marcados.length > 0 && <span className="ml-1 text-primary">({marcados.length})</span>}
        </span>
        {marcados.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            limpar
          </button>
        )}
      </div>
      <div className="rounded-md border">
        {busca && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="h-8 w-full border-b bg-transparent px-2 text-[12px] outline-none"
          />
        )}
        {escondidos.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-1.5">
            {escondidos.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => alternar(v, false)}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/20"
                title="Remover"
              >
                {rotuloDe(v)} ×
              </button>
            ))}
          </div>
        )}
        <div className="max-h-40 overflow-y-auto p-1">
          {visiveis.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-muted-foreground">
              {opcoes.length ? "Nada encontrado" : "Carregando…"}
            </p>
          ) : (
            visiveis.map((o) => (
              <label
                key={o.valor}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12px] hover:bg-muted/50"
              >
                <Checkbox
                  checked={marcados.includes(o.valor)}
                  onCheckedChange={(v) => alternar(o.valor, v === true)}
                />
                <span className="min-w-0 truncate">{o.rotulo}</span>
              </label>
            ))
          )}
        </div>
      </div>
      {ajuda && <p className="text-[11px] text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}
