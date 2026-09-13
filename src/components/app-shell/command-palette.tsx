import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { buscaGlobal, type ResultadoBusca } from "@/lib/busca.functions";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type PaletteRoute = { to: string; label: string; group: string };

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
  routes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  routes: PaletteRoute[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const buscar = useServerFn(buscaGlobal);
  // ordem em que os grupos aparecem para quem busca
  const TIPOS: Array<[ResultadoBusca["tipo"], string]> = [
    ["empresa", "Empresas"],
    ["cliente", "Clientes do CS"],
    ["lead", "Leads"],
  ];
  const termo = query.trim();

  // Consulta o banco em vez de baixar o kanban inteiro para filtrar aqui.
  const { data, isFetching } = useQuery({
    queryKey: ["busca-global", termo],
    queryFn: () => buscar({ data: { q: termo } }),
    enabled: open && termo.length >= 2,
    staleTime: 30_000,
  });

  const porTipo = useMemo(() => {
    const map = new Map<ResultadoBusca["tipo"], ResultadoBusca[]>();
    for (const r of data?.resultados ?? []) {
      map.set(r.tipo, [...(map.get(r.tipo) ?? []), r]);
    }
    return map;
  }, [data]);

  function go(to: string) {
    onOpenChange(false);
    setQuery("");
    navigate({ to });
  }

  const groups = useMemo(() => {
    const map = new Map<string, PaletteRoute[]>();
    for (const r of routes) {
      map.set(r.group, [...(map.get(r.group) ?? []), r]);
    }
    return [...map.entries()];
  }, [routes]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar lead, empresa ou página…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {termo.length < 2
            ? "Digite ao menos duas letras."
            : isFetching
              ? "Procurando…"
              : `Nada encontrado para “${query}”.`}
        </CommandEmpty>
        {TIPOS.map(([tipo, titulo]) => {
          const itens = porTipo.get(tipo) ?? [];
          if (itens.length === 0) return null;
          return (
            <CommandGroup key={tipo} heading={titulo}>
              {itens.map((r) => (
                <CommandItem
                  key={`${r.tipo}-${r.id}`}
                  value={`${r.tipo}-${r.id}-${r.titulo}`}
                  onSelect={() => go(r.to)}
                >
                  <span className="truncate font-medium">{r.titulo}</span>
                  {r.subtitulo && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {r.subtitulo}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {groups.map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((r) => (
              <CommandItem key={r.to} value={`${group} ${r.label}`} onSelect={() => go(r.to)}>
                {r.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
