import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type LostReasonOption = {
  /** O valor usado no filtro. Grafias do mesmo motivo compartilham este valor. */
  reason: string;
  /** O que a pessoa lê, quando difere do valor (texto livre, por exemplo). */
  label?: string;
  count: number;
};

type Props = {
  options: LostReasonOption[];
  /** Contagem de leads desqualificados sem motivo (0 esconde a opção). */
  withoutReasonCount?: number;
  /** Mostra "Sem motivo informado" mesmo sem contagem conhecida. */
  showWithoutReason?: boolean;
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
  label?: string;
};

/** Dropdown multi-seleção com busca para motivos de desqualificação. */
export function LostReasonFilter({
  options,
  withoutReasonCount = 0,
  showWithoutReason = false,
  value,
  onChange,
  className,
  label = "Motivo de desqualificação",
}: Props) {
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const list: Array<{ key: string; label: string; count: number | null }> = options.map((o) => ({
      key: o.reason,
      label: o.label ?? o.reason,
      count: o.count,
    }));
    if (withoutReasonCount > 0 || showWithoutReason) {
      list.push({
        key: "__nd",
        label: "Sem motivo informado",
        count: withoutReasonCount > 0 ? withoutReasonCount : null,
      });
    }
    return list;
  }, [options, withoutReasonCount, showWithoutReason]);

  const toggle = (key: string) => {
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  };

  const summary =
    value.length === 0
      ? `${label}: todos`
      : value.length === 1
        ? (items.find((i) => i.key === value[0])?.label ?? value[0])
        : `${label}: ${value.length} selecionados`;

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-left text-sm"
            title={label}
          >
            <span className="truncate text-muted-foreground">{summary}</span>
            <span className="flex shrink-0 items-center gap-1">
              {value.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Limpar motivos"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onChange([]);
                    }
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-0">
          <Command>
            <CommandInput placeholder="Buscar motivo..." />
            <CommandList className="max-h-72">
              <CommandEmpty>Nenhum motivo encontrado.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const active = value.includes(item.key);
                  return (
                    <CommandItem
                      key={item.key}
                      value={item.label}
                      onSelect={() => toggle(item.key)}
                    >
                      <Check className={`mr-2 h-4 w-4 ${active ? "opacity-100" : "opacity-0"}`} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.count !== null && (
                        <span className="ml-2 text-xs text-muted-foreground">{item.count}</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
