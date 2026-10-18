import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, X } from "lucide-react";
import { listarPessoas } from "@/lib/notificacoes.functions";

/**
 * Marcar pessoas num registro (ex.: o ADM marca o executivo quando falta
 * informação). Cada pessoa marcada recebe notificação com o link.
 */
export function MencionarPessoas({
  valor,
  onChange,
}: {
  valor: string[];
  onChange: (ids: string[]) => void;
}) {
  const fn = useServerFn(listarPessoas);
  const { data: pessoas } = useQuery({
    queryKey: ["pessoas-mencao"],
    queryFn: () => fn(),
    staleTime: 10 * 60_000,
  });
  const nome = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {valor.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
        >
          @{nome.get(id) ?? "…"}
          <button
            type="button"
            aria-label="Remover menção"
            onClick={() => onChange(valor.filter((v) => v !== id))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <AtSign className="h-3 w-3" />
        <select
          className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id && !valor.includes(id) && valor.length < 10) onChange([...valor, id]);
          }}
        >
          <option value="">Mencionar alguém</option>
          {(pessoas ?? [])
            .filter((p) => !valor.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
