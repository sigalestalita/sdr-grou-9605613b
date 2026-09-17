import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Ticket } from "lucide-react";
import {
  atualizarTicket,
  listarTickets,
  PRIORIDADES,
  STATUS_TICKET,
} from "@/lib/cs-tickets.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/cs-tickets")({
  component: TicketsPage,
  head: () => ({ meta: [{ title: "Tickets do CS | Grou Compass" }] }),
});

const TOM_PRIORIDADE: Record<string, string> = {
  urgente: "border-destructive/50 bg-destructive/10 text-destructive",
  alta: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  normal: "",
  baixa: "text-muted-foreground",
};

/*
 * A fila de tickets do CS.
 *
 * O pedido do cliente chegava como mensagem solta no WhatsApp: sem estado, sem
 * dono e sem como saber o que ficou em aberto. O ticket dá as três coisas.
 *
 * "Aguardando cliente" é status próprio de propósito: muda de quem é a bola, e
 * sem isso a fila mistura o que depende do analista com o que depende do
 * cliente — e o tempo de resposta do time fica irreal.
 */
function TicketsPage() {
  const listFn = useServerFn(listarTickets);
  const atualizarFn = useServerFn(atualizarTicket);
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("abertos");
  const [meus, setMeus] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cs-tickets", status, meus],
    queryFn: () => listFn({ data: { status: status === "abertos" ? undefined : status, meus } }),
    refetchInterval: 60_000,
  });

  const mudar = useMutation({
    mutationFn: (p: { id: string; status?: string; prioridade?: string; responsavelId?: string }) =>
      atualizarFn({
        data: {
          id: p.id,
          ...(p.status ? { status: p.status as never } : {}),
          ...(p.prioridade ? { prioridade: p.prioridade as never } : {}),
          ...(p.responsavelId !== undefined ? { responsavelId: p.responsavelId || null } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-tickets"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const tickets = data?.tickets ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-8">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Ticket className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          Tickets do CS
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Os pedidos de suporte dos clientes. Nascem da conversa de WhatsApp — a IA abre sozinha o
          que precisa de gente — ou à mão, pela ficha do cliente.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="abertos">Em aberto</option>
          <option value="todos">Todos</option>
          {STATUS_TICKET.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input type="checkbox" checked={meus} onChange={(e) => setMeus(e.target.checked)} />
          Só os meus
        </label>
        <span className="ml-auto text-[12px] text-muted-foreground">
          {tickets.length} ticket(s)
        </span>
      </div>

      {isLoading && <p className="text-[13px] text-muted-foreground">Carregando…</p>}
      {!isLoading && tickets.length === 0 && (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Nenhum ticket nesse filtro.
        </p>
      )}

      <ul className="space-y-2">
        {tickets.map((t) => (
          <li key={t.id} className="surface-panel space-y-2 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  <span className="text-muted-foreground">#{t.numero}</span> {t.titulo}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t.empresa}
                  {t.responsavel ? ` · ${t.responsavel}` : " · sem responsável"}
                  {t.categoria ? ` · ${t.categoria}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {t.abertoPelaIa && (
                  <Badge variant="outline" className="gap-1 text-[10px]" title="Aberto pela IA">
                    <Bot className="h-3 w-3" /> IA
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] ${TOM_PRIORIDADE[t.prioridade]}`}>
                  {t.prioridade}
                </Badge>
              </div>
            </div>

            {t.descricao && (
              <p className="text-[12px] leading-relaxed text-muted-foreground">{t.descricao}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={t.status}
                onChange={(e) => mudar.mutate({ id: t.id, status: e.target.value })}
                className="h-7 rounded-md border bg-background px-2 text-[11px]"
                title={STATUS_TICKET.find((s) => s.valor === t.status)?.ajuda}
              >
                {STATUS_TICKET.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
              <select
                value={t.prioridade}
                onChange={(e) => mudar.mutate({ id: t.id, prioridade: e.target.value })}
                className="h-7 rounded-md border bg-background px-2 text-[11px]"
              >
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={t.responsavelId ?? ""}
                onChange={(e) => mudar.mutate({ id: t.id, responsavelId: e.target.value })}
                className="h-7 rounded-md border bg-background px-2 text-[11px]"
              >
                <option value="">— sem responsável —</option>
                {(data?.pessoas ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
