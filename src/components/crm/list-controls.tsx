import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Columns3,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/*
 * Controles de lista no padrão HubSpot, agnósticos ao objeto listado:
 * abas de visão salva, chips de filtro rápido e seletor de colunas.
 * Visões salvas ficam no banco, por pessoa (visoes_salvas).
 */

export type SavedView<F> = {
  id: string;
  label: string;
  filters: Partial<F>;
  builtin?: boolean;
};

type LinhaVisao = { id: string; nome: string; filtros: unknown; ordem: number };
type Resp<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type TabelaVisoes = {
  select(c: string): { eq(k: string, v: string): { order(k: string): Resp<LinhaVisao[]> } };
  insert(rows: unknown): { select(c: string): Resp<{ id: string }[]> };
  update(row: unknown): { eq(k: string, v: string): Resp<null> };
  delete(): { eq(k: string, v: string): Resp<null> };
};
// visoes_salvas ainda não está nos tipos gerados do Supabase.
const tabelaVisoes = () =>
  (supabase as unknown as { from(t: string): TabelaVisoes }).from("visoes_salvas");

/*
 * Visões salvas de cada pessoa, no banco (visoes_salvas), por lista ("objeto").
 * Na primeira vez, as visões padrão viram visões da pessoa — e daí em diante
 * todas podem ser renomeadas, atualizadas com os filtros atuais, duplicadas,
 * reordenadas ou excluídas. "Restaurar padrão" volta ao conjunto inicial.
 * Visões antigas guardadas só no navegador (legacyKey) entram na primeira carga.
 */
export function useSavedViews<F>(objeto: string, builtins: SavedView<F>[], legacyKey?: string) {
  const qc = useQueryClient();
  const chave = ["visoes-salvas", objeto];
  const semeando = useRef(false);
  const db = tabelaVisoes();

  const { data: linhas, isLoading } = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await db
        .select("id, nome, filtros, ordem")
        .eq("objeto", objeto)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: chave });

  const semear = async (extras: SavedView<F>[] = []) => {
    const base = [...builtins, ...extras];
    const { error } = await db
      .insert(base.map((v, i) => ({ objeto, nome: v.label, filtros: v.filters, ordem: i })))
      .select("id");
    if (error) throw error;
    await recarregar();
  };

  // Primeira vez nesta lista: as padrão (e as antigas do navegador) viram da pessoa.
  useEffect(() => {
    if (isLoading || !linhas || linhas.length > 0 || semeando.current) return;
    semeando.current = true;
    let antigas: SavedView<F>[] = [];
    try {
      const raw = legacyKey ? window.localStorage.getItem(legacyKey) : null;
      if (raw) antigas = JSON.parse(raw) as SavedView<F>[];
    } catch {
      /* sem as antigas */
    }
    void semear(antigas).catch(() => {
      semeando.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, linhas]);

  const views: SavedView<F>[] = (linhas ?? []).map((l) => ({
    id: l.id,
    label: l.nome,
    filters: (l.filtros ?? {}) as Partial<F>,
  }));

  const proximaOrdem = () => Math.max(-1, ...(linhas ?? []).map((l) => l.ordem)) + 1;

  return {
    views,
    loading: isLoading || (linhas?.length ?? 0) === 0,
    async addView(label: string, filters: Partial<F>) {
      const { data, error } = await db
        .insert({ objeto, nome: label, filtros: filters, ordem: proximaOrdem() })
        .select("id");
      if (error) throw error;
      await recarregar();
      return data?.[0]?.id ?? "";
    },
    async renameView(id: string, label: string) {
      const { error } = await db
        .update({ nome: label, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await recarregar();
    },
    async updateView(id: string, filters: Partial<F>) {
      const { error } = await db
        .update({ filtros: filters, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await recarregar();
    },
    async removeView(id: string) {
      const { error } = await db.delete().eq("id", id);
      if (error) throw error;
      await recarregar();
    },
    async moveView(id: string, dir: -1 | 1) {
      const lista = [...(linhas ?? [])];
      const i = lista.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= lista.length) return;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      await Promise.all(
        lista.map((l, k) => (l.ordem === k ? null : db.update({ ordem: k }).eq("id", l.id))),
      );
      await recarregar();
    },
    async restoreDefaults() {
      for (const l of linhas ?? []) await db.delete().eq("id", l.id);
      await semear();
    },
  };
}

export function ViewTabs<F>({
  views,
  activeId,
  dirty,
  onSelect,
  onCreate,
  onRemove,
  onRename,
  onSaveFilters,
  onDuplicate,
  onMove,
  onRestore,
}: {
  views: SavedView<F>[];
  activeId: string | null;
  /** Filtros atuais divergem da visão ativa. */
  dirty?: boolean;
  onSelect: (view: SavedView<F>) => void;
  onCreate?: () => void;
  onRemove?: (id: string) => void;
  onRename?: (id: string) => void;
  /** Grava os filtros atuais na visão. */
  onSaveFilters?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMove?: (id: string, dir: -1 | 1) => void;
  onRestore?: () => void;
}) {
  const editavel = !!(onRemove || onRename || onSaveFilters || onDuplicate || onMove);
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto border-b">
      {views.map((v, i) => {
        const active = v.id === activeId;
        return (
          <div
            key={v.id}
            className={`group -mb-px flex shrink-0 items-center border-b-2 transition-colors ${
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(v)}
              onDoubleClick={() => onRename?.(v.id)}
              className="flex items-center gap-1.5 whitespace-nowrap py-2 pl-3 pr-1 text-[13px]"
            >
              {v.label}
              {active && dirty && (
                <span className="text-[10px] text-muted-foreground">· editada</span>
              )}
            </button>
            {editavel && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground ${
                    active ? "" : "opacity-0 group-hover:opacity-100"
                  }`}
                  title="Opções da visão"
                >
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {onSaveFilters && (
                    <DropdownMenuItem
                      disabled={!(active && dirty)}
                      onClick={() => onSaveFilters(v.id)}
                    >
                      <Save className="mr-2 h-3.5 w-3.5" /> Salvar filtros atuais nesta visão
                    </DropdownMenuItem>
                  )}
                  {onRename && (
                    <DropdownMenuItem onClick={() => onRename(v.id)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear
                    </DropdownMenuItem>
                  )}
                  {onDuplicate && (
                    <DropdownMenuItem onClick={() => onDuplicate(v.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                    </DropdownMenuItem>
                  )}
                  {onMove && (
                    <>
                      <DropdownMenuItem disabled={i === 0} onClick={() => onMove(v.id, -1)}>
                        <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Mover para a esquerda
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={i === views.length - 1}
                        onClick={() => onMove(v.id, 1)}
                      >
                        <ArrowRight className="mr-2 h-3.5 w-3.5" /> Mover para a direita
                      </DropdownMenuItem>
                    </>
                  )}
                  {onRemove && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={views.length <= 1}
                        className="text-destructive focus:text-destructive"
                        onClick={() => onRemove(v.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir visão
                      </DropdownMenuItem>
                    </>
                  )}
                  {onRestore && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onRestore}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restaurar visões padrão
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          title="Salvar filtros atuais como nova visão"
          className="-mb-px shrink-0 border-b-2 border-transparent px-2 py-2 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export type ChipOption = { value: string; label: string };

/** Filtro rápido no formato "Rótulo: valor ▾", com limpar embutido. */
export function FilterChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ChipOption[];
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  const active = value !== "";
  return (
    <span
      className={`relative inline-flex h-8 items-center rounded-md border text-[13px] transition-colors ${
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        // O texto do próprio select fica invisível: quem aparece é o rótulo
        // com o valor, logo abaixo. Com os dois visíveis, um escrevia por
        // cima do outro. As opções da lista continuam legíveis.
        className="h-full cursor-pointer appearance-none bg-transparent pl-2.5 pr-7 text-transparent outline-none [&>option]:bg-popover [&>option]:text-popover-foreground"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Texto visível: rótulo + valor escolhido */}
      <span className="pointer-events-none absolute inset-y-0 left-2.5 right-7 flex items-center gap-1 truncate bg-transparent">
        <span className="truncate">
          {label}
          {current ? `: ${current.label}` : ""}
        </span>
      </span>
      {active ? (
        <button
          type="button"
          aria-label={`Limpar ${label}`}
          onClick={() => onChange("")}
          className="absolute right-1.5 grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
      )}
    </span>
  );
}

export type ColumnDef = { key: string; label: string; always?: boolean };

export function useVisibleColumns(storageKey: string, columns: ColumnDef[]) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setHidden(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const toggle = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const visible = columns.filter((c) => c.always || !hidden.includes(c.key));
  return { visible, hidden, toggle };
}

export function ColumnPicker({
  columns,
  hidden,
  onToggle,
}: {
  columns: ColumnDef[];
  hidden: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <Columns3 className="h-3.5 w-3.5" /> Colunas
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-56 rounded-md border bg-popover p-1 shadow-lg">
            {columns
              .filter((c) => !c.always)
              .map((c) => {
                const on = !hidden.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onToggle(c.key)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    <span
                      className={`grid h-4 w-4 place-items-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    {c.label}
                  </button>
                );
              })}
          </div>
        </>
      )}
    </span>
  );
}
