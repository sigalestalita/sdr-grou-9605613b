import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Building2, User as UserIcon } from "lucide-react";
import { definirDonoDaConta, getCarteira, moverNaCarteira } from "@/lib/carteira.functions";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/carteira-comercial")({
  component: CarteiraPage,
  head: () => ({ meta: [{ title: "Carteira comercial | Grou Compass" }] }),
});

const SEM_DONO = "__sem_dono__";

/**
 * Gestão da Carteira Comercial: o card é a empresa cliente. Entra na primeira
 * venda ganha, sem dono, e a gestão distribui. O executivo acompanha e move as
 * contas dele; venda nova nasce como negócio no funil de recompra/cross sell.
 */
function CarteiraPage() {
  const qc = useQueryClient();
  const fn = useServerFn(getCarteira);
  const moverFn = useServerFn(moverNaCarteira);
  const donoFn = useServerFn(definirDonoDaConta);
  const [dono, setDono] = useState<string>("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["carteira-comercial"],
    queryFn: () => fn({ data: {} }),
    staleTime: 30_000,
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["carteira-comercial"] });
  const mover = useMutation({
    mutationFn: (v: { cardId: string; stageId: string }) => moverFn({ data: v }),
    onSuccess: recarregar,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const definirDono = useMutation({
    mutationFn: (v: { cardId: string; ownerId: string | null }) => donoFn({ data: v }),
    onSuccess: () => {
      toast.success("Dono da conta definido");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const nomeDe = new Map((data?.executivos ?? []).map((p) => [p.id, p.nome]));
  const hoje = new Date().toISOString().slice(0, 10);
  const cards = (data?.cards ?? []).filter((c) =>
    dono === "todos" ? true : dono === SEM_DONO ? !c.ownerId : c.ownerId === dono,
  );
  const semDono = (data?.cards ?? []).filter((c) => !c.ownerId).length;
  const stages = (data?.stages ?? []).filter((s) => s.kind === "open");
  const semEtapa = cards.filter((c) => !stages.some((s) => s.id === c.stageId));
  const colunas = [...(semEtapa.length ? [{ id: "", nome: "Sem etapa" }] : []), ...stages];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-lg font-semibold">Carteira comercial</h1>
          <p className="text-[12px] text-muted-foreground">
            {data?.cards.length ?? 0} empresas na carteira
            {semDono > 0 && ` · ${semDono} esperando a gestão definir o dono`}
          </p>
        </div>
        <Select value={dono} onValueChange={setDono}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <UserIcon className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os donos</SelectItem>
            <SelectItem value={SEM_DONO}>Sem dono</SelectItem>
            {(data?.executivos ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Carregando carteira…</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 lg:px-6">
          {colunas.map((col) => {
            const doCol = col.id ? cards.filter((c) => c.stageId === col.id) : semEtapa;
            return (
              <section
                key={col.id || "sem"}
                className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40"
              >
                <h2 className="flex items-center justify-between px-3 py-2 text-[12px] font-semibold">
                  {col.nome}
                  <span className="text-muted-foreground">{doCol.length}</span>
                </h2>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {doCol.map((c) => {
                    const vencida = !!c.licencaVenceEm && c.licencaVenceEm < hoje;
                    return (
                      <article
                        key={c.id}
                        className="rounded-md border bg-card p-3 text-[12px] shadow-sm"
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          {c.empresa.fichaCs ? (
                            <Link
                              to="/empresas/$uid"
                              params={{ uid: c.empresa.fichaCs }}
                              className="inline-flex items-center gap-1 font-medium hover:underline"
                            >
                              <Building2 className="h-3.5 w-3.5 shrink-0" /> {c.empresa.nome}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium">
                              <Building2 className="h-3.5 w-3.5 shrink-0" /> {c.empresa.nome}
                            </span>
                          )}
                          {c.empresa.consultoria && <Badge variant="outline">Consultoria</Badge>}
                        </div>
                        {c.licencaVenceEm && (
                          <p className={vencida ? "text-destructive" : "text-muted-foreground"}>
                            Licença PDA {vencida ? "venceu" : "vence"} em{" "}
                            {format(new Date(`${c.licencaVenceEm}T12:00:00`), "dd/MM/yyyy", {
                              locale: ptBR,
                            })}
                          </p>
                        )}
                        <div className="mt-2 grid gap-1.5">
                          {data?.gestao ? (
                            <select
                              className="h-7 rounded-md border bg-background px-1 text-[11px]"
                              value={c.ownerId ?? ""}
                              onChange={(e) =>
                                definirDono.mutate({
                                  cardId: c.id,
                                  ownerId: e.target.value || null,
                                })
                              }
                            >
                              <option value="">Sem dono</option>
                              {(data?.executivos ?? [])
                                .filter((p) => p.executivo || p.id === c.ownerId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nome}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span className="text-muted-foreground">
                              Dono:{" "}
                              {c.ownerId ? (nomeDe.get(c.ownerId) ?? "—") : "a definir pela gestão"}
                            </span>
                          )}
                          <select
                            className="h-7 rounded-md border bg-background px-1 text-[11px]"
                            value={c.stageId ?? ""}
                            onChange={(e) =>
                              e.target.value &&
                              mover.mutate({ cardId: c.id, stageId: e.target.value })
                            }
                          >
                            {!c.stageId && <option value="">Mover para…</option>}
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
