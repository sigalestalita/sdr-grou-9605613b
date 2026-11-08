import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeOff, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useCurrentRole } from "@/lib/use-role";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/*
 * Etapas ocultas de um kanban. Cada pessoa escolhe as colunas que não quer
 * ver; a gestão pode ocultar para todos. Vale a escolha da pessoa; sem
 * escolha própria, vale a da gestão. Os cards das etapas ocultas não somem:
 * o aviso "N etapas ocultas · X cards" fica no topo.
 */
type Linha = { id: string; user_id: string | null; etapas: string[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from("kanban_etapas_ocultas");

export function useEtapasOcultas(quadro: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const chave = ["kanban-etapas-ocultas", quadro, user?.id ?? ""];
  const { data } = useQuery({
    queryKey: chave,
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await tabela().select("id, user_id, etapas").eq("quadro", quadro);
      if (error) throw new Error(error.message);
      return (data ?? []) as Linha[];
    },
  });
  const minha = data?.find((l) => l.user_id === user?.id) ?? null;
  const todos = data?.find((l) => l.user_id === null) ?? null;
  const ocultas = useMemo(() => new Set((minha ?? todos)?.etapas ?? []), [minha, todos]);

  const salvar = useMutation({
    mutationFn: async (v: { etapas: string[]; paraTodos: boolean }) => {
      const alvo = v.paraTodos ? todos : minha;
      if (alvo) {
        const { error } = await tabela()
          .update({ etapas: v.etapas, updated_at: new Date().toISOString() })
          .eq("id", alvo.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await tabela().insert({
          quadro,
          user_id: v.paraTodos ? null : user?.id,
          etapas: v.etapas,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  /** Volta a seguir o padrão da gestão (apaga a escolha própria). */
  const seguirPadrao = useMutation({
    mutationFn: async () => {
      if (!minha) return;
      const { error } = await tabela().delete().eq("id", minha.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  return {
    ocultas,
    temEscolhaPropria: !!minha,
    padraoDaGestao: new Set(todos?.etapas ?? []),
    salvar: salvar.mutate,
    seguirPadrao: seguirPadrao.mutate,
    salvando: salvar.isPending,
  };
}

type Etapa = { id: string; nome: string };

/** Botão "Etapas" com a lista para mostrar/ocultar colunas. */
export function EtapasVisiveis({
  quadro,
  etapas,
  contagem,
}: {
  quadro: string;
  etapas: Etapa[];
  /** Cards por etapa, para o aviso de quantos ficaram escondidos. */
  contagem?: (etapaId: string) => number;
}) {
  const { canAccessAll } = useCurrentRole();
  const e = useEtapasOcultas(quadro);
  const ocultasAqui = etapas.filter((x) => e.ocultas.has(x.id));
  const escondidos = contagem ? ocultasAqui.reduce((s, x) => s + contagem(x.id), 0) : 0;

  const alternar = (id: string, paraTodos: boolean) => {
    const base = paraTodos ? e.padraoDaGestao : e.ocultas;
    const n = new Set(base);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    if (!paraTodos && n.size >= etapas.length) {
      toast.error("Deixe pelo menos uma etapa visível");
      return;
    }
    e.salvar({ etapas: [...n], paraTodos });
  };

  return (
    <div className="flex items-center gap-2">
      {ocultasAqui.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          <EyeOff className="h-3 w-3" />
          {ocultasAqui.length} {ocultasAqui.length === 1 ? "etapa oculta" : "etapas ocultas"}
          {contagem ? ` · ${escondidos} cards` : ""}
        </span>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Etapas
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div>
            <p className="text-[13px] font-semibold">Etapas visíveis</p>
            <p className="text-[11px] text-muted-foreground">
              {e.temEscolhaPropria
                ? "Sua escolha. Só muda o que você vê."
                : "Seguindo o padrão da gestão. Ao mudar, vira sua escolha."}
            </p>
          </div>
          <ul className="max-h-72 space-y-1.5 overflow-auto">
            {etapas.map((x) => (
              <li key={x.id} className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  id={`etapa-${quadro}-${x.id}`}
                  checked={!e.ocultas.has(x.id)}
                  disabled={e.salvando}
                  onCheckedChange={() => alternar(x.id, false)}
                />
                <label htmlFor={`etapa-${quadro}-${x.id}`} className="flex-1 cursor-pointer">
                  {x.nome}
                </label>
                {contagem && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {contagem(x.id)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {e.temEscolhaPropria && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => e.seguirPadrao()}
            >
              Voltar ao padrão da gestão
            </button>
          )}
          {canAccessAll && (
            <div className="space-y-1.5 border-t pt-2">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Gestão: ocultar para todos
              </p>
              {etapas.map((x) => (
                <label key={x.id} className="flex items-center gap-2 text-[12px]">
                  <Checkbox
                    checked={e.padraoDaGestao.has(x.id)}
                    disabled={e.salvando}
                    onCheckedChange={() => alternar(x.id, true)}
                  />
                  {x.nome}
                </label>
              ))}
              <p className="text-[10.5px] text-muted-foreground">
                Vale para quem não fez escolha própria.
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
