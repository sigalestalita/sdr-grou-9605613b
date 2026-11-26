import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Combine, Loader2, Search, X } from "lucide-react";
import {
  buscarEmpresasParaMesclar,
  ignorarGrupoDeParecidas,
  listarEmpresasParecidas,
  mesclarEmpresas,
  type EmpresaParecida,
  type GrupoDeParecidas,
} from "@/lib/empresas-mescla.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  const [motivo, setMotivo] = useState<"" | "Mesmo CNPJ" | "Mesmo domínio" | "Nome parecido">("");
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
        (!motivo || g.motivo === motivo) &&
        (!q || g.empresas.some((e) => e.nome.toLowerCase().includes(q))),
    );
  }, [data, motivo, busca]);
  const contagem = (m: string) => (data ?? []).filter((g) => g.motivo === m).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-4 p-4 lg:p-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Combine className="h-5 w-5 text-muted-foreground" /> Empresas parecidas
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
          Empresas com o mesmo CNPJ, o mesmo domínio ou o nome parecido (sem acento, pontuação e
          Ltda/S.A.). Ao mesclar, contatos, leads, negócios, cliente do CS, propostas e faturamento
          vão para a empresa que fica, os campos vazios dela são completados e a outra sai. Só a
          gestão mescla.
        </p>
      </header>

      <MesclaManual />

      <div className="flex flex-wrap items-center gap-2">
        {(["", "Mesmo CNPJ", "Mesmo domínio", "Nome parecido"] as const).map((m) => (
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

  const mesclar = useMutation({
    mutationFn: () =>
      mesclarFn({ data: { ficaId: fica, saiIds: [...saem].filter((id) => id !== fica) } }),
    onSuccess: (r) => {
      toast.success(`${r.mescladas} empresa(s) mescladas em “${nomeFica}”`);
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao mesclar"),
  });
  const ignorar = useMutation({
    mutationFn: () => ignorarFn({ data: { grupo: g.grupo } }),
    onSuccess: () => {
      toast.success("Grupo tirado da lista");
      qc.invalidateQueries({ queryKey: ["empresas-parecidas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const nSaem = [...saem].filter((id) => id !== fica).length;

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          {g.motivo}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          Marque a que fica e as que entram nela
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
