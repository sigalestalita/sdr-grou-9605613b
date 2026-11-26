import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertTriangle,
  Building2,
  Combine,
  GitBranch,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  buscarEmpresasParaMesclar,
  ignorarGrupoDeParecidas,
  ligarFiliais,
  listarEmpresasParecidas,
  listarRevisoesDeParecidas,
  mesclarEmpresas,
  reabrirGrupoDeParecidas,
  type EmpresaParecida,
  type GrupoDeParecidas,
} from "@/lib/empresas-mescla.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pareceFiliais, sugerirNomeDaMae } from "@/lib/empresas-parecidas";

export const Route = createFileRoute("/_app/empresas-parecidas")({
  component: EmpresasParecidasPage,
  head: () => ({ meta: [{ title: "Empresas parecidas | Grou Compass" }] }),
});

/** A que fica por padrão: cliente, ligada ao RD, com mais coisas ligadas, a mais antiga. */
function sugerirQueFica(empresas: EmpresaParecida[]): string {
  const peso = (e: EmpresaParecida) =>
    (e.cliente ? 1_000_000 : 0) +
    (e.rdOrgId ? 100_000 : 0) +
    (e.cnpj ? 10_000 : 0) +
    e.negocios * 100 +
    e.contatos +
    e.leads;
  return [...empresas].sort((a, b) => peso(b) - peso(a) || a.criadoEm.localeCompare(b.criadoEm))[0]
    .id;
}

const POR_PAGINA = 30;

function EmpresasParecidasPage() {
  const listarFn = useServerFn(listarEmpresasParecidas);
  const [aba, setAba] = useState<"pendentes" | "revisadas">("pendentes");
  const [motivo, setMotivo] = useState<
    "" | "Mesmo CNPJ" | "Mesmo domínio" | "Nome parecido" | "Possíveis filiais"
  >("");
  const [busca, setBusca] = useState("");
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const { data, isLoading, error } = useQuery({
    queryKey: ["empresas-parecidas"],
    queryFn: () => listarFn({ data: { limite: 2000 } }),
    staleTime: 60_000,
  });
  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(
      (g) =>
        (!motivo ||
          (motivo === "Possíveis filiais"
            ? pareceFiliais(
                g.empresas.map((e) => e.nome),
                g.motivo,
              )
            : g.motivo === motivo)) &&
        (!q || g.empresas.some((e) => e.nome.toLowerCase().includes(q))),
    );
  }, [data, motivo, busca]);
  const contagem = (m: string) =>
    (data ?? []).filter((g) =>
      m === "Possíveis filiais"
        ? pareceFiliais(
            g.empresas.map((e) => e.nome),
            g.motivo,
          )
        : g.motivo === m,
    ).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-4 p-4 lg:p-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Combine className="h-5 w-5 text-muted-foreground" /> Empresas parecidas
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
          Revisão da gestão: empresas com o mesmo CNPJ, o mesmo domínio ou o nome parecido. Para
          cada grupo, decida: <strong>Mesclar</strong> (é a mesma empresa — tudo vai para a que fica
          e a outra sai), <strong>São filiais</strong> (unidades de uma rede, como Sicredi, Gerdau,
          Ambev — ficam ligadas à empresa-mãe, sem mesclar) ou <strong>Não são a mesma</strong>.
          Cada decisão fica registrada em “Revisadas”.
        </p>
      </header>

      <div className="flex gap-1 border-b">
        {(
          [
            ["pendentes", `Para revisar${data ? ` (${data.length})` : ""}`],
            ["revisadas", "Revisadas"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setAba(v)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${
              aba === v
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {aba === "revisadas" ? (
        <Revisadas />
      ) : (
        <>
          <MesclaManual />

          <div className="flex flex-wrap items-center gap-2">
            {(
              ["", "Possíveis filiais", "Mesmo CNPJ", "Mesmo domínio", "Nome parecido"] as const
            ).map((m) => (
              <Button
                key={m || "todos"}
                size="sm"
                variant={motivo === m ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => {
                  setMotivo(m);
                  setMostrar(POR_PAGINA);
                }}
              >
                {m || "Todos"} {data ? `(${m ? contagem(m) : data.length})` : ""}
              </Button>
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setMostrar(POR_PAGINA);
                }}
                placeholder="Filtrar pelo nome"
                className="h-8 w-56 pl-8 text-xs"
              />
            </div>
          </div>

          {isLoading && <p className="text-[13px] text-muted-foreground">Procurando parecidas…</p>}
          {error && (
            <p className="text-[13px] text-destructive">
              {error instanceof Error ? error.message : "Erro"}
            </p>
          )}
          {data && grupos.length === 0 && (
            <p className="text-[13px] text-muted-foreground">Nenhum grupo com esse filtro.</p>
          )}
          <div className="space-y-3">
            {grupos.slice(0, mostrar).map((g) => (
              <CartaoGrupo key={g.grupo} g={g} />
            ))}
          </div>
          {grupos.length > mostrar && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setMostrar((n) => n + POR_PAGINA)}
            >
              Mostrar mais ({grupos.length - mostrar} grupos)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function CartaoGrupo({ g }: { g: GrupoDeParecidas }) {
  const qc = useQueryClient();
  const mesclarFn = useServerFn(mesclarEmpresas);
  const ignorarFn = useServerFn(ignorarGrupoDeParecidas);
  const [fica, setFica] = useState(() => sugerirQueFica(g.empresas));
  const [saem, setSaem] = useState<Set<string>>(
    () => new Set(g.empresas.map((e) => e.id).filter((id) => id !== sugerirQueFica(g.empresas))),
  );
  const nomeFica = g.empresas.find((e) => e.id === fica)?.nome ?? "";
  const clientes = g.empresas.filter((e) => e.cliente && (e.id === fica || saem.has(e.id)));
  const filiaisProvavel = pareceFiliais(
    g.empresas.map((e) => e.nome),
    g.motivo,
  );
  const [organizando, setOrganizando] = useState(false);

  const mesclar = useMutation({
    mutationFn: () =>
      mesclarFn({ data: { ficaId: fica, saiIds: [...saem].filter((id) => id !== fica) } }),
    onSuccess: (r) => {
      toast.success(`${r.mescladas} empresa(s) mescladas em “${nomeFica}”`);
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
      qc.invalidateQueries({ queryKey: ["empresas-parecidas-revisadas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao mesclar"),
  });
  const ignorar = useMutation({
    mutationFn: () => ignorarFn({ data: { grupo: g.grupo } }),
    onSuccess: () => {
      toast.success("Grupo tirado da lista");
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
      qc.invalidateQueries({ queryKey: ["empresas-parecidas-revisadas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const nSaem = [...saem].filter((id) => id !== fica).length;

  return (
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {g.motivo}
          </Badge>
          {filiaisProvavel && (
            <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Parecem filiais
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          ● a principal (que fica / a mãe) · ☑ as que entram na decisão
        </span>
      </div>
      <div className="divide-y rounded-md border">
        {g.empresas.map((e) => {
          const eFica = e.id === fica;
          return (
            <label
              key={e.id}
              className={`flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2 text-[13px] ${eFica ? "bg-primary/5" : ""}`}
            >
              <input
                type="radio"
                name={`fica-${g.grupo}`}
                checked={eFica}
                onChange={() => {
                  setFica(e.id);
                  setSaem(new Set(g.empresas.map((x) => x.id).filter((id) => id !== e.id)));
                }}
                title="Esta fica"
              />
              <input
                type="checkbox"
                disabled={eFica}
                checked={!eFica && saem.has(e.id)}
                onChange={(ev) =>
                  setSaem((s) => {
                    const n = new Set(s);
                    if (ev.target.checked) n.add(e.id);
                    else n.delete(e.id);
                    return n;
                  })
                }
                title="Mesclar esta na que fica"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-medium">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{e.nome}</span>
                  {eFica && <Badge className="text-[9px]">fica</Badge>}
                  {e.cliente && (
                    <Badge variant="secondary" className="text-[9px]">
                      cliente CS
                    </Badge>
                  )}
                  {e.rdOrgId && (
                    <Badge variant="outline" className="text-[9px]">
                      RD
                    </Badge>
                  )}
                  {e.maeNome && (
                    <Badge variant="outline" className="gap-0.5 text-[9px]">
                      <GitBranch className="h-2.5 w-2.5" /> filial de {e.maeNome}
                    </Badge>
                  )}
                  {e.filiais > 0 && (
                    <Badge variant="outline" className="text-[9px]">
                      mãe de {e.filiais}
                    </Badge>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[e.cnpj, e.dominio, e.local].filter(Boolean).join(" · ") || "sem CNPJ e domínio"}
                </p>
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {e.contatos} contatos · {e.leads} leads · {e.negocios} negócios
              </span>
            </label>
          );
        })}
      </div>
      {clientes.length > 1 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Mais de uma é cliente do CS: depois de mesclar, os {clientes.length} cadastros de cliente
          ficam na mesma empresa (confira na carteira do CS se algum deve ser desativado).
        </p>
      )}
      {filiaisProvavel && !organizando && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Os nomes indicam unidades diferentes (código, cidade, UF ou regional). Se forem filiais da
          mesma rede, use “São filiais” em vez de mesclar.
        </p>
      )}
      {organizando && (
        <OrganizarFiliais
          g={g}
          principal={fica}
          selecionadas={[...saem].filter((id) => id !== fica)}
          onFechar={() => setOrganizando(false)}
        />
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={ignorar.isPending}
          onClick={() => ignorar.mutate()}
        >
          Não são a mesma
        </Button>
        <Button
          size="sm"
          variant={filiaisProvavel ? "default" : "outline"}
          disabled={organizando}
          onClick={() => setOrganizando(true)}
        >
          <GitBranch className="mr-1 h-3.5 w-3.5" /> São filiais
        </Button>
        <Button
          size="sm"
          variant={filiaisProvavel ? "outline" : "default"}
          disabled={nSaem === 0 || mesclar.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Mesclar ${nSaem} empresa(s) em “${nomeFica}”? Tudo o que está ligado a elas passa para “${nomeFica}”, e elas deixam de existir.`,
              )
            )
              mesclar.mutate();
          }}
        >
          {mesclar.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Combine className="mr-1 h-3.5 w-3.5" />
          )}
          Mesclar {nSaem > 0 ? `(${nSaem})` : ""}
        </Button>
      </div>
    </Card>
  );
}

/**
 * "São filiais": escolhe a empresa-mãe (a principal do grupo, outra já
 * cadastrada ou uma nova) e liga as marcadas a ela, sem mesclar.
 */
function OrganizarFiliais({
  g,
  principal,
  selecionadas,
  onFechar,
}: {
  g: GrupoDeParecidas;
  principal: string;
  selecionadas: string[];
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(ligarFiliais);
  const sugestao = sugerirNomeDaMae(g.empresas.map((e) => e.nome));
  const [modo, setModo] = useState<"grupo" | "outra" | "nova">(sugestao ? "nova" : "grupo");
  const [outra, setOutra] = useState<Achada | null>(null);
  const [nova, setNova] = useState(sugestao);
  const nomePrincipal = g.empresas.find((e) => e.id === principal)?.nome ?? "";
  // Com mãe de fora do grupo, todas as marcadas (inclusive a principal) viram filiais.
  const filhas = modo === "grupo" ? selecionadas : [principal, ...selecionadas];
  const ligar = useMutation({
    mutationFn: () =>
      fn({
        data: {
          grupo: g.grupo,
          maeId: modo === "grupo" ? principal : modo === "outra" ? (outra?.id ?? null) : null,
          novaMaeNome: modo === "nova" ? nova.trim() : "",
          filhasIds: filhas,
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.ligadas} filial(is) ligadas à empresa-mãe`);
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
      qc.invalidateQueries({ queryKey: ["empresas-parecidas-revisadas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao ligar filiais"),
  });
  const pronto =
    filhas.length > 0 &&
    (modo === "grupo"
      ? selecionadas.length > 0
      : modo === "outra"
        ? !!outra
        : nova.trim().length >= 2);
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-[12px]">
      <p className="font-semibold">Qual é a empresa-mãe?</p>
      <label className="flex items-center gap-2">
        <input type="radio" checked={modo === "grupo"} onChange={() => setModo("grupo")} />A
        principal deste grupo: <strong>{nomePrincipal}</strong>
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={modo === "nova"} onChange={() => setModo("nova")} />
        Criar a empresa-mãe:
        <Input
          value={nova}
          onChange={(e) => {
            setNova(e.target.value);
            setModo("nova");
          }}
          placeholder="Ex.: Sicredi"
          className="h-7 w-56 text-xs"
        />
      </label>
      <div className="flex items-start gap-2">
        <input
          type="radio"
          className="mt-1"
          checked={modo === "outra"}
          onChange={() => setModo("outra")}
        />
        <div className="flex-1" onFocus={() => setModo("outra")}>
          <BuscaEmpresa rotulo="Outra empresa já cadastrada" valor={outra} onChange={setOutra} />
        </div>
      </div>
      <p className="text-muted-foreground">
        Vão ficar ligadas como filiais: {filhas.length} empresa(s). Nada é apagado nem mesclado; dá
        para desfazer em “Revisadas”.
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button size="sm" disabled={!pronto || ligar.isPending} onClick={() => ligar.mutate()}>
          {ligar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Ligar como filiais
        </Button>
      </div>
    </div>
  );
}

/** O que a gestão já decidiu, com quem e quando; dá para reabrir. */
function Revisadas() {
  const qc = useQueryClient();
  const listarFn = useServerFn(listarRevisoesDeParecidas);
  const reabrirFn = useServerFn(reabrirGrupoDeParecidas);
  const { data, isLoading, error } = useQuery({
    queryKey: ["empresas-parecidas-revisadas"],
    queryFn: () => listarFn(),
  });
  const reabrir = useMutation({
    mutationFn: (grupo: string) => reabrirFn({ data: { grupo } }),
    onSuccess: (r) => {
      toast.success(
        r.soltas ? `Grupo reaberto · ${r.soltas} filial(is) soltas da mãe` : "Grupo reaberto",
      );
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
      qc.invalidateQueries({ queryKey: ["empresas-parecidas-revisadas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  if (isLoading) return <p className="text-[13px] text-muted-foreground">Carregando…</p>;
  if (error)
    return (
      <p className="text-[13px] text-destructive">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );
  const dt = (v: string) => format(new Date(v), "dd/MM/yyyy HH:mm");
  const rotuloGrupo = (g: string) => g.replace(/^(cnpj|dominio|nome):/, "");
  return (
    <div className="space-y-4">
      <Card className="p-3">
        <p className="mb-2 text-[12px] font-semibold">
          Filiais e “não são a mesma” ({data?.decisoes.length ?? 0})
        </p>
        {!data?.decisoes.length ? (
          <p className="text-[12px] text-muted-foreground">Nenhuma decisão ainda.</p>
        ) : (
          <div className="divide-y rounded-md border text-[12px]">
            {data.decisoes.map((d) => (
              <div key={d.grupo} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {d.decisao === "filiais" ? (
                  <Badge className="gap-1 text-[10px]">
                    <GitBranch className="h-3 w-3" /> filiais
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    não são a mesma
                  </Badge>
                )}
                <span className="min-w-0 flex-1">
                  {d.decisao === "filiais" ? (
                    <>
                      <strong>{d.mae}</strong> ← {d.filhas.join(", ")}
                    </>
                  ) : (
                    rotuloGrupo(d.grupo)
                  )}
                </span>
                <span className="text-muted-foreground">
                  {d.por} · {dt(d.em)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={reabrir.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        d.decisao === "filiais"
                          ? "Reabrir? As filiais deixam de estar ligadas a esta empresa-mãe e o grupo volta para a revisão."
                          : "Reabrir? O grupo volta para a revisão.",
                      )
                    )
                      reabrir.mutate(d.grupo);
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Reabrir
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-3">
        <p className="mb-2 text-[12px] font-semibold">Mescladas ({data?.mesclas.length ?? 0})</p>
        {!data?.mesclas.length ? (
          <p className="text-[12px] text-muted-foreground">Nenhuma mescla ainda.</p>
        ) : (
          <div className="divide-y rounded-md border text-[12px]">
            {data.mesclas.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Combine className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  “{m.saiu}” entrou em <strong>{m.fica}</strong>
                  <span className="text-muted-foreground"> · {m.movidos} registros movidos</span>
                </span>
                <span className="text-muted-foreground">
                  {m.por} · {dt(m.em)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Mesclas não têm desfazer automático; os dados da empresa que saiu ficam guardados no
          registro da mescla.
        </p>
      </Card>
    </div>
  );
}

type Achada = { id: string; uid: string; nome: string; detalhe: string };

function BuscaEmpresa({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: Achada | null;
  onChange: (v: Achada | null) => void;
}) {
  const fn = useServerFn(buscarEmpresasParaMesclar);
  const [termo, setTermo] = useState("");
  const [atrasado, setAtrasado] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);
  const { data, isFetching } = useQuery({
    queryKey: ["empresas-mesclar-busca", atrasado],
    queryFn: () => fn({ data: { q: atrasado } }),
    enabled: !valor && atrasado.length >= 2,
  });
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{rotulo}</p>
      {valor ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1.5 text-[13px]">
          <span className="min-w-0">
            <span className="block truncate font-medium">{valor.nome}</span>
            {valor.detalhe && (
              <span className="block truncate text-[11px] text-muted-foreground">
                {valor.detalhe}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome ou CNPJ"
            className="h-8 text-[13px]"
          />
          {atrasado.length >= 2 && (
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {isFetching && !data ? (
                <p className="p-2 text-[11px] text-muted-foreground">Buscando…</p>
              ) : !data?.length ? (
                <p className="p-2 text-[11px] text-muted-foreground">Nada encontrado.</p>
              ) : (
                data.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onChange(e)}
                    className="block w-full border-b px-2 py-1 text-left text-[12px] last:border-0 hover:bg-muted/50"
                  >
                    <span className="block truncate">{e.nome}</span>
                    {e.detalhe && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {e.detalhe}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Duas empresas quaisquer (quando a lista não as juntou). */
function MesclaManual() {
  const qc = useQueryClient();
  const fn = useServerFn(mesclarEmpresas);
  const [fica, setFica] = useState<Achada | null>(null);
  const [sai, setSai] = useState<Achada | null>(null);
  const mesclar = useMutation({
    mutationFn: () => fn({ data: { ficaId: fica!.id, saiIds: [sai!.id] } }),
    onSuccess: () => {
      toast.success(`“${sai?.nome}” mesclada em “${fica?.nome}”`);
      setSai(null);
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao mesclar"),
  });
  return (
    <Card className="space-y-2 p-3">
      <p className="text-[12px] font-semibold">Mesclar duas empresas</p>
      <div className="flex flex-wrap items-start gap-3">
        <BuscaEmpresa rotulo="Fica" valor={fica} onChange={setFica} />
        <BuscaEmpresa rotulo="Sai (entra na que fica)" valor={sai} onChange={setSai} />
        <Button
          size="sm"
          className="mt-5"
          disabled={!fica || !sai || fica.id === sai.id || mesclar.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Mesclar “${sai!.nome}” em “${fica!.nome}”? Tudo o que está ligado a ela passa para “${fica!.nome}”, e ela deixa de existir.`,
              )
            )
              mesclar.mutate();
          }}
        >
          <Combine className="mr-1 h-3.5 w-3.5" /> Mesclar
        </Button>
      </div>
    </Card>
  );
}
