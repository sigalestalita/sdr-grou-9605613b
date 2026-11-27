import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCsJourney, sendCsJourneyEmail, setCsJourneyStatus, type CsJourneyRow } from "@/lib/cs-journey.functions";
import { Mail, Send, SkipForward, Undo2 } from "lucide-react";

const STATUS: Record<CsJourneyRow["status"], { label: string; cls: string }> = {
  agendado: { label: "Agendado", cls: "text-muted-foreground" },
  pendente: { label: "Pronto para enviar", cls: "border-amber-500/40 bg-amber-500/10 text-amber-600" },
  enviado: { label: "Enviado", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" },
  pulado: { label: "Pulado", cls: "text-muted-foreground" },
  expirado: { label: "Expirado", cls: "text-muted-foreground" },
  erro: { label: "Erro", cls: "border-red-500/40 bg-red-500/10 text-red-600" },
};
const fmt = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

/** E-mails das Jornadas Reais: marcos por dia de licença, com envio/aprovação por marco. */
export function CsJourneyPanel({ clientUid }: { clientUid: string }) {
  const getFn = useServerFn(getCsJourney);
  const sendFn = useServerFn(sendCsJourneyEmail);
  const statusFn = useServerFn(setCsJourneyStatus);
  const qc = useQueryClient();
  const key = ["cs-journey", clientUid];
  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { clientUid } }) });
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
  };
  const send = useMutation({
    mutationFn: (id: string) => sendFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`E-mail enviado para ${r.to}`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "pulado" | "pendente" }) => statusFn({ data: v }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (q.isLoading || !q.data) return <p className="text-[12px] text-muted-foreground">Carregando…</p>;
  const { items, modo } = q.data;
  if (items.length === 0)
    return (
      <p className="text-[11px] text-muted-foreground">
        Sem marcos: informe o início do contrato (ou renovação) em "Sobre esta empresa".
      </p>
    );
  return (
    <div className="space-y-2 text-[12px]">
      <p className="text-[11px] text-muted-foreground">
        {modo === "automatico" ? "Envio automático no dia do marco." : "Modo aprovação: o analista envia com um clique no dia do marco."}
      </p>
      <ul className="divide-y">
        {items.map((it) => {
          const st = STATUS[it.status];
          return (
            <li key={it.id} className="space-y-1 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="min-w-0 text-left">
                  <p className="truncate font-medium">
                    <Mail className="mr-1 inline h-3 w-3 text-muted-foreground" />
                    {it.titulo}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {fmt(it.dueAt)}
                    {it.toEmail ? ` · ${it.toName ?? ""} <${it.toEmail}>` : " · sem contato com e-mail"}
                    {it.sentAt ? ` · enviado ${new Date(it.sentAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </button>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${st.cls}`}>{st.label}</Badge>
              </div>
              {open === it.id && (
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 font-sans text-[11px] leading-5">
                  <strong>Assunto:</strong> {it.assunto}
                  {"\n\n"}
                  {it.preview}
                </pre>
              )}
              {it.error && <p className="text-[11px] text-red-600">{it.error}</p>}
              <div className="flex flex-wrap gap-1">
                {(it.status === "pendente" || it.status === "agendado" || it.status === "erro" || it.status === "expirado") && (
                  <Button size="sm" variant={it.status === "pendente" ? "default" : "outline"} className="h-6 px-2 text-[11px]" disabled={send.isPending} onClick={() => send.mutate(it.id)}>
                    <Send className="mr-1 h-3 w-3" /> Enviar {it.status === "agendado" ? "antes do marco" : "agora"}
                  </Button>
                )}
                {(it.status === "pendente" || it.status === "agendado") && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setStatus.mutate({ id: it.id, status: "pulado" })}>
                    <SkipForward className="mr-1 h-3 w-3" /> Pular
                  </Button>
                )}
                {(it.status === "pulado" || it.status === "expirado") && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setStatus.mutate({ id: it.id, status: "pendente" })}>
                    <Undo2 className="mr-1 h-3 w-3" /> Reativar
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
