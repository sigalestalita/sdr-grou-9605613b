import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FilterChip,
  ViewTabs,
  useSavedViews,
  type SavedView,
} from "@/components/crm/list-controls";
import { listContatos } from "@/lib/contatos.functions";

export const Route = createFileRoute("/_app/contatos")({
  head: () => ({ meta: [{ title: "Contatos · Compass" }] }),
  component: ContatosPage,
});

type Filtros = {
  q: string;
  analista: boolean;
  meus: boolean;
  comEmail: boolean;
  semEmpresa: boolean;
};
const VAZIO: Filtros = { q: "", analista: false, meus: false, comEmail: false, semEmpresa: false };

const PADRAO: SavedView<Filtros>[] = [
  { id: "todos", label: "Todos os contatos", filters: {} },
  { id: "meus", label: "Meus contatos", filters: { meus: true } },
  { id: "analistas", label: "Analistas PDA", filters: { analista: true } },
];

/**
 * Contatos: todas as pessoas de todas as empresas, para todos os times. Cada
 * pessoa monta e salva as próprias visões.
 */
function ContatosPage() {
  const listFn = useServerFn(listContatos);
  const visoes = useSavedViews<Filtros>("contatos", PADRAO);
  const [viewId, setViewId] = useState("");
  const [f, setF] = useState<Filtros>(VAZIO);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const ativa = visoes.views.find((v) => v.id === viewId) ?? null;
  const dirty = ativa
    ? JSON.stringify({ ...f, q: "" }) !== JSON.stringify({ ...VAZIO, ...ativa.filters, q: "" })
    : false;

  useEffect(() => {
    if (!viewId && visoes.views[0]) {
      setViewId(visoes.views[0].id);
      setF({ ...VAZIO, ...visoes.views[0].filters });
    }
  }, [viewId, visoes.views]);
  // Busca com uma pausa curta, para não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, q: busca })), 350);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(0), [f]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["contatos", f, pagina],
    queryFn: () => listFn({ data: { ...f, pagina } }),
    placeholderData: keepPreviousData,
    enabled: !!viewId,
  });

  const selecionar = (v: SavedView<Filtros>) => {
    setViewId(v.id);
    setF({ ...VAZIO, ...v.filters });
    setBusca("");
  };
  const comAviso = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a visão");
    }
  };
  const semBusca = { ...f, q: "" };
  const total = data?.total ?? 0;
  const porPagina = data?.porPagina ?? 50;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const chip = (label: string, k: keyof Omit<Filtros, "q">, rotulo: string) => (
    <FilterChip
      label={label}
      value={f[k] ? "1" : ""}
      options={[{ value: "1", label: rotulo }]}
      onChange={(v) => setF((x) => ({ ...x, [k]: v === "1" }))}
    />
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">Contatos</h1>
        <p className="text-[12px] text-muted-foreground">
          {isLoading ? "Carregando…" : `${total.toLocaleString("pt-BR")} na visão`}
        </p>
      </div>

      <div className="surface-panel">
        <div className="px-3 pt-1">
          <ViewTabs
            views={visoes.views}
            activeId={viewId}
            dirty={dirty}
            onSelect={selecionar}
            onCreate={() => {
              const nome = window.prompt("Nome da nova visão (com os filtros atuais)");
              if (!nome?.trim()) return;
              void comAviso(async () => {
                const id = await visoes.addView(nome.trim().slice(0, 60), semBusca);
                if (id) setViewId(id);
              }, "Visão criada");
            }}
            onRename={(id) => {
              const atual = visoes.views.find((v) => v.id === id);
              const nome = window.prompt("Novo nome da visão", atual?.label ?? "");
              if (!nome?.trim()) return;
              void comAviso(
                () => visoes.renameView(id, nome.trim().slice(0, 60)),
                "Visão renomeada",
              );
            }}
            onSaveFilters={(id) =>
              void comAviso(() => visoes.updateView(id, semBusca), "Filtros salvos na visão")
            }
            onDuplicate={(id) => {
              const v = visoes.views.find((x) => x.id === id);
              if (v)
                void comAviso(
                  () => visoes.addView(`${v.label} (cópia)`.slice(0, 60), v.filters),
                  "Visão duplicada",
                );
            }}
            onMove={(id, dir) => void comAviso(() => visoes.moveView(id, dir), "Visão movida")}
            onRemove={(id) => {
              const v = visoes.views.find((x) => x.id === id);
              if (!v || !window.confirm(`Excluir a visão "${v.label}"?`)) return;
              void comAviso(async () => {
                await visoes.removeView(id);
                const outra = visoes.views.find((x) => x.id !== id);
                if (viewId === id && outra) selecionar(outra);
              }, "Visão excluída");
            }}
            onRestore={() => {
              if (
                !window.confirm(
                  "Voltar às visões padrão? As suas visões de contatos serão apagadas.",
                )
              )
                return;
              void comAviso(async () => {
                await visoes.restoreDefaults();
                setViewId("");
              }, "Visões padrão restauradas");
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 w-72 pl-8"
              placeholder="Nome, e-mail, telefone ou empresa"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {chip("Analista PDA", "analista", "Só analistas")}
          {chip("Dono", "meus", "Meus contatos")}
          {chip("E-mail", "comEmail", "Com e-mail")}
          {chip("Empresa", "semEmpresa", "Sem empresa")}
          {(dirty || busca) && (
            <button
              type="button"
              onClick={() => ativa && selecionar(ativa)}
              className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Empresa</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Dono</th>
                <th>Lead</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && (data?.contatos.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted-foreground">
                    Nenhum contato nesta visão.
                  </td>
                </tr>
              )}
              {(data?.contatos ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">
                    {c.nome ?? "—"}
                    {c.analista_pda && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Analista PDA
                      </Badge>
                    )}
                  </td>
                  <td className="text-muted-foreground">{c.cargo ?? "—"}</td>
                  <td>
                    {c.company_id ? (
                      <Link
                        to="/empresas/$uid"
                        params={{ uid: c.company_id }}
                        className="text-primary hover:underline"
                      >
                        {c.empresa ?? "Empresa"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-[12px]">{c.email ?? "—"}</td>
                  <td className="whitespace-nowrap text-[12px]">{c.telefone ?? "—"}</td>
                  <td className="whitespace-nowrap text-[12px]">{c.sdr ?? "—"}</td>
                  <td>
                    {c.leadId ? (
                      <Link
                        to="/lead/$id"
                        params={{ id: c.leadId }}
                        className="text-[12px] text-primary hover:underline"
                      >
                        Abrir lead
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 border-t px-3 py-2 text-[12px] text-muted-foreground">
          <span>
            Página {pagina + 1} de {paginas.toLocaleString("pt-BR")}
            {isFetching ? " · atualizando…" : ""}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={pagina + 1 >= paginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
