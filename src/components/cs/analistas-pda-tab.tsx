import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { GraduationCap, Mail, Phone } from "lucide-react";
import { analistasDaEmpresa } from "@/lib/analistas-pda.functions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/** Aba "Analistas PDA" da ficha da empresa. */
export function AnalistasPdaTab({ clientUid }: { clientUid: string }) {
  const fn = useServerFn(analistasDaEmpresa);
  const { data, isLoading } = useQuery({
    queryKey: ["analistas-pda", "empresa", clientUid],
    queryFn: () => fn({ data: { clientUid } }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando analistas…</p>;
  if (!data?.length)
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nenhum analista PDA ligado a esta empresa. A gestão importa os analistas em Configurações CS
        → Analistas PDA.
      </Card>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{data.length} analista(s) PDA nesta empresa.</p>
      {data.map((a) => (
        <Card key={`${a.origem}:${a.id}`} className="space-y-1 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <GraduationCap className="h-3.5 w-3.5 text-primary" /> {a.nome}
              {a.cargo && (
                <span className="text-xs font-normal text-muted-foreground">· {a.cargo}</span>
              )}
            </p>
            <div className="flex items-center gap-1">
              {a.certificadoEm && (
                <Badge variant="outline" className="text-[10px]">
                  certificado em {format(new Date(`${a.certificadoEm}T12:00:00`), "dd/MM/yyyy")}
                </Badge>
              )}
              {a.origem === "contato" && (
                <Badge variant="secondary" className="text-[10px]">
                  marcado no contato
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            {a.email && (
              <a
                href={`mailto:${a.email}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Mail className="h-3 w-3" /> {a.email}
              </a>
            )}
            {a.telefone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {a.telefone}
              </span>
            )}
          </div>
          {Object.keys(a.dados).length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {Object.entries(a.dados)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
