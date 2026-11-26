import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { usoDaPlataformaCs } from "@/lib/cs-plataforma.functions";
import { usouNoPeriodo } from "@/lib/cs/plataforma-cs";

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

/**
 * Quem da empresa usa a Plataforma de CS: e-mail, último acesso e o que
 * concluiu em 90 dias. Uso nos últimos 90 dias vale no health score.
 */
export function CsPlataformaPanel({ clientUid }: { clientUid: string }) {
  const fn = useServerFn(usoDaPlataformaCs);
  const q = useQuery({
    queryKey: ["cs-plataforma", clientUid],
    queryFn: () => fn({ data: { clientUid } }),
  });
  const rows = q.data ?? [];
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Carregando…</p>;
  if (!rows.length)
    return (
      <p className="text-xs text-muted-foreground">
        Ninguém da empresa encontrado na plataforma. A ligação é pelo e-mail dos contatos (ou pelo
        domínio do e-mail da empresa).
      </p>
    );
  const ativos = rows.filter((r) => usouNoPeriodo({ ultimaAtividade: r.ultima_atividade }));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {ativos.length} de {rows.length} usaram nos últimos 90 dias
        {ativos.length ? " · conta no health score" : ""}
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.email} className="flex items-start justify-between gap-2 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.nome || r.email}</p>
              <p className="truncate text-muted-foreground">
                {r.nome ? `${r.email} · ` : ""}último acesso {data(r.ultimo_acesso)}
                {r.aulas_90d ? ` · ${r.aulas_90d} aulas` : ""}
                {r.modulos_90d ? ` · ${r.modulos_90d} módulos` : ""}
              </p>
            </div>
            {r.ligado_por === "dominio" && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px]"
                title="Ligado pelo domínio do e-mail: não há contato com esse e-mail exato"
              >
                domínio
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
