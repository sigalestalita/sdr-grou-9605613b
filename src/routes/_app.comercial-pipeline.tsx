import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2,
  CalendarDays,
  FileCheck2,
  Flame,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { listComercialDeals } from "@/lib/comercial.functions";
import { moeda } from "@/lib/comercial/metas";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/comercial-pipeline")({
  component: PipelinePage,
  head: () => ({ meta: [{ title: "Pipeline comercial | Grou Compass" }] }),
});

type Deal = {
  id: string;
  nome: string | null;
  amount: number | null;
  stage_id: string | null;
  executivo_user_id: string | null;
  temperatura: string | null;
  reuniao_em: string | null;
  ordem_compra_em: string | null;
  proposta_aceita_em: string | null;
  fonte: string | null;
  companies?: { id: string; nome: string | null } | null;
};

type Stage = {
  id: string;
  pipeline_id: string;
  nome: string;
  slug: string;
  ordem: number;
  probabilidade: number;
  kind: string;
};

const TEMP_TONE: Record<string, string> = {
  quente: "text-red-500",
  morno: "text-amber-500",
  frio: "text-sky-500",
};

/**
 * Kanban do funil comercial. A gestora pediu kanban em todas as áreas, e no
 * comercial ele é por pipeline, porque cada funil (novos negócios, cross sell,
 * up sell, indicação) tem jornada própria.
 */
function PipelinePage() {
  const fn = useServerFn(listComercialDeals);
  const [pipelineId, setPipelineId] = useState<string | undefined>(undefined);
  const [executivo, setExecutivo] = useState<string>("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["comercial-pipeline", pipelineId, executivo],
    queryFn: () =>
      fn({
        data: {
          ...(pipelineId ? { pipelineId } : {}),
          ...(executivo !== "todos" ? { executivoId: executivo } : {}),
        },
      }),
    staleTime: 30_000,
  });

  const stages = ((data?.stages ?? []) as Stage[])
    .filter((s) => s.kind === "open")
    .sort((a, b) => a.ordem - b.ordem);
  const deals = (data?.deals ?? []) as Deal[];
  const nomeDe = new Map(
    (data?.profiles ?? []).map(
      (p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ],
    ),
  );
  const executivos = [
    ...new Set(deals.map((d) => d.executivo_user_id).filter(Boolean)),
  ] as string[];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-lg font-semibold">Pipeline comercial</h1>
          <p className="text-[12px] text-muted-foreground">
            {deals.length} negócios abertos neste funil
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={pipelineId ?? data?.pipelineId ?? ""}
            onValueChange={(v) => setPipelineId(v)}
          >
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Funil" />
            </SelectTrigger>
            <SelectContent>
              {(data?.pipelines ?? []).map((p: { id: string; nome: string }) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={executivo} onValueChange={setExecutivo}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <UserIcon className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os executivos</SelectItem>
              {executivos.map((id) => (
                <SelectItem key={id} value={id}>
                  {nomeDe.get(id) ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading ? (
        <p className="p-6 text-[13px] text-muted-foreground">Carregando…</p>
      ) : stages.length === 0 ? (
        <p className="p-6 text-[13px] text-muted-foreground">
          Esse funil ainda não tem etapas configuradas.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 lg:p-6">
          {stages.map((s) => {
            const daEtapa = deals.filter((d) => d.stage_id === s.id);
            const total = daEtapa.reduce((a, d) => a + Number(d.amount ?? 0), 0);
            return (
              <div key={s.id} className="flex w-[260px] shrink-0 flex-col">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="truncate text-[12px] font-semibold" title={s.nome}>
                    {s.nome}
                  </p>
                  <Badge variant="outline" className="text-[9px]">
                    {s.probabilidade}%
                  </Badge>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {daEtapa.length} · {moeda(total)}
                </p>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {daEtapa.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                      vazio
                    </p>
                  )}
                  {daEtapa.map((d) => (
                    <Link
                      key={d.id}
                      to="/negocio/$id"
                      params={{ id: d.id }}
                      className="surface-panel block space-y-1 p-2.5 transition-colors hover:border-primary/50"
                    >
                      <p className="truncate text-[12px] font-medium" title={d.nome ?? ""}>
                        {d.nome || "Sem nome"}
                      </p>
                      {d.companies?.nome && (
                        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {d.companies.nome}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                        {Number(d.amount ?? 0) > 0 && (
                          <span className="font-semibold text-foreground">
                            {moeda(Number(d.amount))}
                          </span>
                        )}
                        {d.temperatura && (
                          <span
                            className={`inline-flex items-center gap-0.5 ${TEMP_TONE[d.temperatura] ?? ""}`}
                          >
                            <Flame className="h-3 w-3" />
                            {d.temperatura}
                          </span>
                        )}
                        {d.reuniao_em && (
                          <span className="inline-flex items-center gap-0.5">
                            <CalendarDays className="h-3 w-3" />
                            {format(new Date(d.reuniao_em), "dd/MM", { locale: ptBR })}
                          </span>
                        )}
                        {/* O card que veio da carteira precisa se identificar:
                            o executivo não pediu por ele, ele chegou. */}
                        {d.fonte === "Sinalização do CS" && (
                          <span className="inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400">
                            <Sparkles className="h-3 w-3" />
                            do CS
                          </span>
                        )}
                        {d.ordem_compra_em && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                            <FileCheck2 className="h-3 w-3" />
                            OC
                          </span>
                        )}
                      </div>
                      {d.executivo_user_id && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {nomeDe.get(d.executivo_user_id)}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground lg:px-6">
        Clique no card para trabalhar o negócio. Venda só entra como ganha com a ordem de compra
        registrada.{" "}
        <Link to="/comercial" className="text-primary hover:underline">
          Ver funil e metas
        </Link>
      </footer>
    </div>
  );
}
