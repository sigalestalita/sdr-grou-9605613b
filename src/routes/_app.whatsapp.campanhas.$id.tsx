import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign, launchCampaign, listCampaignReplies } from "@/lib/whatsapp-campaigns.functions";
import { Button } from "@/components/ui/button";
import { useOwnerLabel } from "@/lib/use-owner-label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, MessageSquare, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/campanhas/$id")({
  component: CampaignDetail,
});

function CampaignDetail() {
  const ownerLabel = useOwnerLabel();
  const { id } = Route.useParams();
  const getFn = useServerFn(getCampaign);
  const launchFn = useServerFn(launchCampaign);
  const repliesFn = useServerFn(listCampaignReplies);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["wa-campaign", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 5000,
  });

  const { data: repliesData } = useQuery({
    queryKey: ["wa-campaign-replies", id],
    queryFn: () => repliesFn({ data: { id } }),
    refetchInterval: 15000,
  });
  const replies = repliesData?.replies ?? [];
  const uniqueResponders = new Set(replies.map((r) => r.lead_id)).size;

  const launch = useMutation({
    mutationFn: () => launchFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-campaign", id] }),
  });

  if (isLoading) return <div className="p-6 text-xs text-muted-foreground">Carregando…</div>;
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Erro ao carregar campanha"}
      </div>
    );
  }

  const c = data.campaign as {
    id: string;
    name: string;
    status: string;
    audience_filters: unknown;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    whatsapp_templates: { name: string; body: string } | null;
  };
  const s = data.stats;
  const canLaunch = c.status === "draft" || c.status === "scheduled";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/whatsapp/campanhas" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Campanhas
        </Link>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
            {c.whatsapp_templates && (
              <span className="text-xs text-muted-foreground">Template: {c.whatsapp_templates.name}</span>
            )}
          </div>
        </div>
        <Button onClick={() => launch.mutate()} disabled={!canLaunch || launch.isPending}>
          <Send className="h-4 w-4 mr-1.5" />
          {launch.isPending ? "Enviando…" : canLaunch ? "Disparar agora" : "Já disparada"}
        </Button>
      </div>

      {launch.error instanceof Error && (
        <p className="text-xs text-destructive">{launch.error.message}</p>
      )}
      {launch.data && (
        <p className="text-xs text-muted-foreground">
          Lote disparado: {launch.data.queued} · enviadas {launch.data.sent} · falhas {launch.data.failed}
        </p>
      )}

      <div className="grid grid-cols-5 gap-3">
        {[
          { l: "Total", v: s.total },
          { l: "Enviadas", v: s.sent },
          { l: "Entregues", v: s.delivered },
          { l: "Lidas", v: s.read },
          { l: "Falhas", v: s.failed },
        ].map((k) => (
          <div key={k.l} className="border border-white/5 rounded-lg p-3 bg-card/50">
            <p className="text-[10px] text-muted-foreground uppercase">{k.l}</p>
            <p className="text-xl font-semibold">{k.v}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-primary" /> Respostas recebidas
          </p>
          <span className="text-[11px] text-muted-foreground">
            {uniqueResponders} lead(s) responderam · {replies.length} mensagem(ns)
          </span>
        </div>
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2">Resposta</th>
                <th className="text-left px-3 py-2">Recebida em</th>
                <th className="text-left px-3 py-2">{ownerLabel} responsável</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {replies.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhuma resposta recebida ainda.
                  </td>
                </tr>
              )}
              {replies.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <Link to="/lead/$id" params={{ id: r.lead_id }} className="hover:text-primary font-medium">
                      {r.lead_name ?? (r.phone ? `+${r.phone}` : "—")}
                    </Link>
                    <div className="text-[10px] text-muted-foreground">
                      {r.company_name ?? "—"}
                      {r.is_first && <span className="ml-1 text-primary">· 1ª resposta</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[320px]">
                    <span className="text-muted-foreground line-clamp-2">
                      {r.body?.trim() ? r.body : `[${r.message_type}]`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(r.received_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.sdr_name ?? "Sem responsável"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                      <Link to="/lead/$id" params={{ id: r.lead_id }}>
                        Abrir lead <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {c.whatsapp_templates && (
        <div className="border border-white/5 rounded-lg p-4 bg-card/50">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Corpo do template</p>
          <p className="text-sm whitespace-pre-wrap">{c.whatsapp_templates.body}</p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">Envios</p>
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2">Telefone</th>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Enviado em</th>
              </tr>
            </thead>
            <tbody>
              {data.messages.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhum envio ainda.</td></tr>
              )}
              {data.messages.map((m) => {
                const lead = (m as { leads: { id: string; name: string | null; company_name: string | null; phone: string | null } | null }).leads;
                return (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      {lead ? (
                        <Link to="/lead/$id" params={{ id: lead.id }} className="hover:text-primary">
                          {lead.name ?? (lead.phone ? `+${lead.phone}` : "—")}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">
                      {lead?.phone ? `+${lead.phone}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{lead?.company_name ?? "—"}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{m.status}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {m.sent_at ? new Date(m.sent_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}