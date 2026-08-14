import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listKanbanData } from "@/lib/leads.functions";
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
  const fetchKanban = useServerFn(listKanbanData);

  const { data } = useQuery({
    queryKey: ["kanban"],
    queryFn: () => fetchKanban(),
    enabled: open,
    staleTime: 60_000,
  });

  const leadResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2 || !data?.leads) return [];
    return (data.leads as any[])
      .filter((l) => {
        return [l.name, l.company, l.email, l.phone, l.job_title]
          .filter(Boolean)
          .some((v: string) => String(v).toLowerCase().includes(q));
      })
      .slice(0, 8);
  }, [query, data]);

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
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Busca global" description="Leads e navegação">
      <CommandInput
        placeholder="Buscar lead, empresa ou página…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nada encontrado para “{query}”.</CommandEmpty>
        {leadResults.length > 0 && (
          <CommandGroup heading="Leads">
            {leadResults.map((l) => (
              <CommandItem
                key={l.id}
                value={`lead-${l.id}-${l.name ?? ""}-${l.company ?? ""}`}
                onSelect={() => go(`/lead/${l.id}`)}
              >
                <span className="truncate font-medium">{l.name || "Sem nome"}</span>
                {l.company && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">{l.company}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
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