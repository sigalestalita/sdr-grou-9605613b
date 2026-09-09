import { useEffect, useState } from "react";
import { Check, ChevronDown, Columns3, Plus, X } from "lucide-react";

/*
 * Controles de lista no padrão HubSpot, agnósticos ao objeto listado:
 * abas de visão salva, chips de filtro rápido e seletor de colunas.
 * Visões personalizadas ficam no localStorage por usuário até existir
 * uma tabela de visões compartilhadas.
 */

export type SavedView<F> = {
  id: string;
  label: string;
  filters: Partial<F>;
  builtin?: boolean;
};

export function useSavedViews<F>(storageKey: string, builtins: SavedView<F>[]) {
  const [custom, setCustom] = useState<SavedView<F>[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCustom(JSON.parse(raw) as SavedView<F>[]);
    } catch {
      /* storage indisponível: segue só com as visões padrão */
    }
  }, [storageKey]);

  const persist = (list: SavedView<F>[]) => {
    setCustom(list);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  return {
    views: [...builtins, ...custom],
    addView(label: string, filters: Partial<F>) {
      const id = `v-${Date.now().toString(36)}`;
      persist([...custom, { id, label, filters }]);
      return id;
    },
    removeView(id: string) {
      persist(custom.filter((v) => v.id !== id));
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
}: {
  views: SavedView<F>[];
  activeId: string | null;
  /** Filtros atuais divergem da visão ativa. */
  dirty?: boolean;
  onSelect: (view: SavedView<F>) => void;
  onCreate?: () => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto border-b">
      {views.map((v) => {
        const active = v.id === activeId;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v)}
            className={`group -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors ${
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
            {active && dirty && (
              <span className="text-[10px] text-muted-foreground">· editada</span>
            )}
            {!v.builtin && onRemove && (
              <span
                role="button"
                title="Remover visão"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(v.id);
                }}
                className="hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive group-hover:inline-flex"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          title="Salvar filtros atuais como visão"
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
        className="h-full cursor-pointer appearance-none bg-transparent pl-2.5 pr-7 outline-none"
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
