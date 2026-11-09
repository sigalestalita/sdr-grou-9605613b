import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Briefcase,
  Building2,
  CalendarClock,
  FileText,
  Filter,
  Mail,
  MessageSquare,
  Phone,
  Settings2,
  StickyNote,
  Trophy,
  User,
  Workflow,
  ListChecks,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  historicoDoLead,
  type EventoHistorico,
  type TipoEvento,
} from "@/lib/lead-historico.functions";

const TIPOS: Record<TipoEvento, { rotulo: string; icone: typeof Mail; cor: string }> = {
  conversao: { rotulo: "Conversões", icone: Trophy, cor: "text-amber-600" },
  negocio: { rotulo: "Negociações", icone: Briefcase, cor: "text-violet-600" },
  anotacao: { rotulo: "Anotações", icone: StickyNote, cor: "text-sky-600" },
  tarefa: { rotulo: "Tarefas", icone: ListChecks, cor: "text-sky-600" },
  contato: { rotulo: "Contatos (e-mail, ligação)", icone: Phone, cor: "text-emerald-600" },
  whatsapp: { rotulo: "WhatsApp", icone: MessageSquare, cor: "text-emerald-600" },
  reuniao: { rotulo: "Reuniões", icone: CalendarClock, cor: "text-primary" },
  proposta: { rotulo: "Propostas", icone: FileText, cor: "text-violet-600" },
  etapa: { rotulo: "Mudanças de etapa", icone: Workflow, cor: "text-muted-foreground" },
  email: { rotulo: "E-mails", icone: Mail, cor: "text-sky-600" },
  sistema: { rotulo: "Sistema", icone: Settings2, cor: "text-muted-foreground" },
};
const ORDEM = Object.keys(TIPOS) as TipoEvento[];

const dataHora = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

/** Linha do tempo da pessoa: tudo o que aconteceu com ela, de qualquer origem. */
export function HistoricoDoLead({ leadId }: { leadId: string }) {
  const fn = useServerFn(historicoDoLead);
  const { data, isLoading, error } = useQuery({
    queryKey: ["lead-historico", leadId],
    queryFn: () => fn({ data: { leadId } }),
  });
  const [ocultos, setOcultos] = useState<Set<TipoEvento>>(new Set());

  const contagem = useMemo(() => {
    const m = new Map<TipoEvento, number>();
    for (const e of data?.eventos ?? []) m.set(e.tipo, (m.get(e.tipo) ?? 0) + 1);
    return m;
  }, [data?.eventos]);
  const visiveis = (data?.eventos ?? []).filter((e) => !ocultos.has(e.tipo));

  if (isLoading) return <p className="p-2 text-sm text-muted-foreground">Carregando histórico…</p>;
  if (error || !data)
    return (
      <p className="p-2 text-sm text-destructive">
        {error instanceof Error ? error.message : "Erro ao carregar o histórico"}
      </p>
    );
  const p = data.perfil;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <h3 className="text-[13px] font-semibold text-muted-foreground">
            Dados de identificação
          </h3>
          <Linha rotulo="E-mail" valor={p.email} href={p.email ? `mailto:${p.email}` : null} />
          <Linha rotulo="Telefone" valor={p.telefone} />
          <Linha rotulo="Cargo" valor={p.cargo} />
          <Linha rotulo="Cidade" valor={p.cidade} />
          {p.linkedin && <Linha rotulo="LinkedIn" valor="Abrir perfil" href={p.linkedin} />}
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="text-[13px] font-semibold text-muted-foreground">Detalhes do lead</h3>
          <div>
            <p className="text-[11px] text-muted-foreground">Empresa</p>
            {p.empresa?.fichaCs ? (
              <Link
                to="/empresas/$uid"
                params={{ uid: p.empresa.fichaCs }}
                className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
              >
                <Building2 className="h-3.5 w-3.5" /> {p.empresa.nome}
              </Link>
            ) : (
              <p className="text-[13px]">{p.empresa?.nome ?? "—"}</p>
            )}
          </div>
          <Linha rotulo="Estágio no funil" valor={p.estagio} />
          <Linha rotulo="Ciclo de vida" valor={p.cicloDeVida} />
          <Linha rotulo="Dono do lead" valor={p.dono} />
          <Linha rotulo="Origem" valor={p.origem} />
          <Linha rotulo="Entrou em" valor={dataHora(p.entrouEm)} />
          {p.cadastros > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Esta pessoa entrou {p.cadastros} vezes; o histórico junta todas.
            </p>
          )}
        </Card>
        {data.negocios.length > 0 && (
          <Card className="space-y-2 p-4">
            <h3 className="text-[13px] font-semibold text-muted-foreground">
              Negócios ({data.negocios.length})
            </h3>
            {data.negocios.map((n) => (
              <Link
                key={n.id}
                to="/negocio/$id"
                params={{ id: n.id }}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[12px] hover:bg-muted"
              >
                <span className="truncate">{n.nome}</span>
                <Badge
                  variant={n.status === "won" ? "default" : "outline"}
                  className="shrink-0 text-[10px]"
                >
                  {n.status === "won" ? "Ganho" : n.status === "lost" ? "Perdido" : "Aberto"}
                </Badge>
              </Link>
            ))}
          </Card>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Atividades do lead</h2>
          <span className="text-[11px] text-muted-foreground">
            {visiveis.length} de {data.eventos.length}
          </span>
        </div>
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 border-b pb-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {ORDEM.filter((t) => contagem.get(t)).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-1.5 text-[12px]">
              <Checkbox
                checked={!ocultos.has(t)}
                onCheckedChange={() =>
                  setOcultos((o) => {
                    const n = new Set(o);
                    if (n.has(t)) n.delete(t);
                    else n.add(t);
                    return n;
                  })
                }
              />
              {TIPOS[t].rotulo}
              <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                {contagem.get(t)}
              </span>
            </label>
          ))}
        </div>
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        ) : (
          <ol className="relative space-y-0 border-l pl-6">
            {visiveis.map((e) => (
              <ItemDoHistorico key={e.id} e={e} />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function ItemDoHistorico({ e }: { e: EventoHistorico }) {
  const t = TIPOS[e.tipo];
  const Icone = t.icone;
  return (
    <li className="relative border-b py-3 last:border-0">
      <span className="absolute -left-[37px] top-3 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
        <Icone className={`h-3.5 w-3.5 ${t.cor}`} />
      </span>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-0.5">
        <p className="text-[13px] font-medium">{e.titulo}</p>
        <span className="text-[11px] tabular-nums text-muted-foreground">{dataHora(e.quando)}</span>
      </div>
      {e.detalhe && (
        <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{e.detalhe}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {e.autor && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" /> {e.autor}
          </span>
        )}
        {e.dealId && (
          <Link
            to="/negocio/$id"
            params={{ id: e.dealId }}
            className="text-primary hover:underline"
          >
            Abrir negócio
          </Link>
        )}
      </div>
    </li>
  );
}

function Linha({
  rotulo,
  valor,
  href,
}: {
  rotulo: string;
  valor: string | null;
  href?: string | null;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      {href && valor ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-[13px] text-primary">
          {valor}
        </a>
      ) : (
        <p className="break-words text-[13px]">{valor ?? "—"}</p>
      )}
    </div>
  );
}
