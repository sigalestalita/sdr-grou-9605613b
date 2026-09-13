import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Route as RouteIcon } from "lucide-react";
import {
  getJornadaCliente,
  listEmpresasComJornada,
  MODULO_LABEL,
  type EtapaJornada,
} from "@/lib/jornada.functions";
import { moeda } from "@/lib/comercial/metas";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/jornada")({
  validateSearch: z.object({ empresa: z.string().uuid().optional() }),
  component: JornadaPage,
  head: () => ({
    meta: [
      { title: "Jornada do cliente | Grou Compass" },
      {
        name: "description",
        content: "O caminho completo de um cliente, do lead no SDR ao atendimento no CS.",
      },
    ],
  }),
});

const MODULO_TONE: Record<EtapaJornada["modulo"], { dot: string; chip: string }> = {
  sdr: {
    dot: "bg-sky-500",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  comercial: {
    dot: "bg-violet-500",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  adm: {
    dot: "bg-amber-500",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  cs: {
    dot: "bg-emerald-500",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

const SINAL_LABEL: Record<string, string> = {
  verde: "Verde",
  amarelo: "Amarelo",
  vermelho: "Vermelho",
  sem_dado: "Sem dado",
};

/**
 * Jornada de ponta a ponta. Mostra numa linha só o que cada módulo sabe da
 * mesma empresa, com o tempo entre as etapas — que é onde os SLAs entre áreas
 * aparecem sem precisar de relatório.
 */
function JornadaPage() {
  const listFn = useServerFn(listEmpresasComJornada);
  const fn = useServerFn(getJornadaCliente);
  // A busca do topo manda a empresa pela URL.
  const { empresa: empresaDaUrl } = Route.useSearch();
  const [empresaId, setEmpresaId] = useState<string>(empresaDaUrl ?? "");
  useEffect(() => {
    if (empresaDaUrl) setEmpresaId(empresaDaUrl);
  }, [empresaDaUrl]);

  const lista = useQuery({
    queryKey: ["jornada-empresas"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });
  const empresas = lista.data?.empresas ?? [];
  const alvo = empresaId || (empresas[0]?.id as string | undefined) || "";

  const q = useQuery({
    queryKey: ["jornada", alvo],
    queryFn: () => fn({ data: { companyId: alvo } }),
    enabled: !!alvo,
  });
  const d = q.data;

  return (
    <div className="mx-auto max-w-[980px] space-y-6 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <RouteIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            Jornada do cliente
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            O caminho inteiro de uma empresa, do lead que o SDR trabalhou até o atendimento do CS.
            Os quatro módulos falam da mesma empresa, então a linha é uma só.
          </p>
        </div>
        <Select value={alvo} onValueChange={setEmpresaId}>
          <SelectTrigger className="h-9 w-72 text-xs">
            <Building2 className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Escolha a empresa" />
          </SelectTrigger>
          <SelectContent>
            {empresas.map((e: { id: string; nome: string; exemplo?: boolean }) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {q.isLoading && <p className="text-[13px] text-muted-foreground">Carregando…</p>}
      {q.error && (
        <p className="text-[13px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Erro ao carregar"}
        </p>
      )}

      {d && (
        <>
          <section className="surface-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{d.empresa.nome}</h2>
                <p className="text-[12px] text-muted-foreground">
                  {[
                    d.empresa.segmento,
                    d.empresa.num_funcionarios ? `${d.empresa.num_funcionarios} pessoas` : null,
                    [d.empresa.cidade, d.empresa.estado].filter(Boolean).join("/"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {d.empresa.exemplo && <Badge variant="outline">Registro de exemplo</Badge>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Mini
                label="Ciclo de venda"
                valor={d.cicloVendaDias !== null ? `${d.cicloVendaDias} dias` : "—"}
                hint="da entrada do lead à ordem de compra"
              />
              <Mini
                label="ADM até o CS"
                valor={d.cicloAdmDias !== null ? `${d.cicloAdmDias} dias` : "—"}
                hint="da ordem de compra à entrega"
              />
              <Mini
                label="Valor fechado"
                valor={d.deal ? moeda(Number(d.deal.amount ?? 0)) : "—"}
                hint={d.deal?.tipo_venda ? String(d.deal.tipo_venda) : "sem negócio"}
              />
              <Mini
                label="Situação no CS"
                valor={d.cliente ? (SINAL_LABEL[String(d.cliente.current_signal)] ?? "—") : "—"}
                hint={
                  d.cliente ? `${d.totalEventosCs} atendimentos registrados` : "ainda não entrou"
                }
              />
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            <Quem
              modulo="sdr"
              titulo="Quem trouxe"
              nome={d.lead?.sdrNome ?? null}
              linhas={
                d.lead
                  ? [
                      `${d.lead.name}${d.lead.position ? `, ${d.lead.position}` : ""}`,
                      `Score ${d.lead.score ?? 0} · prioridade ${d.lead.priority ?? "—"}`,
                    ]
                  : ["Sem lead ligado a esta empresa"]
              }
            />
            <Quem
              modulo="comercial"
              titulo="Quem vendeu"
              nome={d.deal?.executivoNome ?? null}
              linhas={
                d.deal
                  ? [
                      String(d.deal.nome ?? ""),
                      d.deal.ordem_compra_numero
                        ? `Ordem de compra ${d.deal.ordem_compra_numero}`
                        : "Sem ordem de compra registrada",
                    ]
                  : ["Sem negócio"]
              }
            />
            <Quem
              modulo="cs"
              titulo="Quem atende"
              nome={d.cliente?.csNome ?? null}
              linhas={
                d.cliente
                  ? [
                      `Jornada: ${d.cliente.journey_stage}`,
                      d.cliente.data_renovacao
                        ? `Renova em ${format(new Date(`${d.cliente.data_renovacao}T12:00:00`), "dd/MM/yyyy")}`
                        : "Sem data de renovação",
                    ]
                  : ["Ainda não chegou ao CS"]
              }
            />
          </div>

          {d.deal?.observacao_adm && (
            <section className="surface-panel p-4">
              <p className="section-label mb-1.5">Briefing que o comercial deixou para o CS</p>
              <p className="text-[13px] leading-relaxed">{String(d.deal.observacao_adm)}</p>
            </section>
          )}

          <section className="surface-panel p-4">
            <p className="section-label mb-3">Linha do tempo</p>
            {d.etapas.length === 0 ? (
              <p className="py-3 text-[13px] text-muted-foreground">
                Esta empresa ainda não tem etapas registradas.
              </p>
            ) : (
              <ol className="relative space-y-0 border-l border-border pl-5">
                {d.etapas.map((e) => {
                  const tone = MODULO_TONE[e.modulo];
                  return (
                    <li key={e.id} className="relative pb-5 last:pb-0">
                      <span
                        className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background ${tone.dot}`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`text-[9px] ${tone.chip}`}>
                          {MODULO_LABEL[e.modulo]}
                        </Badge>
                        <p className="text-[13px] font-medium">{e.titulo}</p>
                        {e.desdeAnterior !== null && e.desdeAnterior > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{e.desdeAnterior} {e.desdeAnterior === 1 ? "dia" : "dias"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {e.em
                          ? format(new Date(e.em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : "—"}
                        {e.quem ? ` · ${e.quem}` : ""}
                      </p>
                      {e.detalhe && (
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                          {e.detalhe}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Mini({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="section-label">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {hint && <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Quem({
  modulo,
  titulo,
  nome,
  linhas,
}: {
  modulo: EtapaJornada["modulo"];
  titulo: string;
  nome: string | null;
  linhas: string[];
}) {
  const tone = MODULO_TONE[modulo];
  return (
    <div className="surface-panel p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
        <p className="section-label">{titulo}</p>
      </div>
      <p className="text-[13px] font-semibold">{nome ?? "Não atribuído"}</p>
      {linhas.map((l, i) => (
        <p key={i} className="truncate text-[11px] text-muted-foreground" title={l}>
          {l}
        </p>
      ))}
    </div>
  );
}
