import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Ticket } from "lucide-react";
import { listConversations } from "@/lib/whatsapp.functions";
import { ConversationView } from "@/components/whatsapp/conversation-view";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/cs-whatsapp")({
  component: CsWhatsappPage,
  head: () => ({ meta: [{ title: "WhatsApp CS | Grou Compass" }] }),
});

/*
 * A caixa de entrada do CS.
 *
 * É a mesma tabela de conversas do SDR, filtrada por área. Quando quem escreve
 * já é cliente, o webhook move a conversa para cá — com o histórico inteiro,
 * porque é a mesma conversa, só em outra caixa.
 */
function CsWhatsappPage() {
  const fn = useServerFn(listConversations);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cs-conversas", busca],
    queryFn: () => fn({ data: { area: "cs", search: busca || undefined } }),
    refetchInterval: 20_000,
  });

  const conversas = data?.conversations ?? [];
  const atual = conversas.find((c) => c.id === selecionada) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold">Atendimento do CS</h1>
            <Link
              to="/cs-tickets"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Ticket className="h-3 w-3" /> Tickets
            </Link>
          </div>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou mensagem…"
            className="h-8 text-xs"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-3 text-[12px] text-muted-foreground">Carregando…</p>}
          {!isLoading && conversas.length === 0 && (
            <p className="p-4 text-[12px] text-muted-foreground">
              Nenhuma conversa aqui ainda. Quando um cliente escrever no WhatsApp, a conversa vem do
              SDR para cá automaticamente, já no nome de quem cuida da conta.
            </p>
          )}
          {conversas.map((c) => {
            const lead = c.leads as { name?: string | null; company_name?: string | null } | null;
            return (
              <button
                key={c.id}
                onClick={() => setSelecionada(c.id)}
                className={`block w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                  selecionada === c.id ? "bg-muted" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] font-medium">
                    {lead?.name ?? "Cliente"}
                  </p>
                  {c.unread_count > 0 && (
                    <Badge className="h-[18px] px-1.5 text-[10px]">{c.unread_count}</Badge>
                  )}
                </div>
                {lead?.company_name && (
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {lead.company_name}
                  </p>
                )}
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {c.last_preview ?? "—"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {atual ? (
          <ConversationView conversationId={atual.id} />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-[13px] text-muted-foreground">
            Escolha uma conversa à esquerda
          </div>
        )}
      </div>
    </div>
  );
}
