import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { anotacoesDoContato } from "@/lib/anotacoes-contato.functions";
import { Card } from "@/components/ui/card";

/** Anotações e tarefas dos negócios deste contato (inclusive as vindas do RD). */
export function AnotacoesDoContato({ contactId }: { contactId: string }) {
  const fn = useServerFn(anotacoesDoContato);
  const { data, isLoading } = useQuery({
    queryKey: ["anotacoes-contato", contactId],
    queryFn: () => fn({ data: { contactId } }),
  });
  if (!isLoading && (data ?? []).length === 0) return null;
  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-semibold">Anotações dos negócios deste contato</h2>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-auto">
          {(data ?? []).map((a) => (
            <div key={a.id} className="border-l-2 border-primary/40 py-1 pl-3">
              <p className="whitespace-pre-wrap text-sm">{a.texto}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(a.em).toLocaleString("pt-BR")}
                {a.autor ? ` · ${a.autor}` : ""} ·{" "}
                <Link to="/negocio/$id" params={{ id: a.dealId }} className="hover:underline">
                  {a.negocio}
                </Link>
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
