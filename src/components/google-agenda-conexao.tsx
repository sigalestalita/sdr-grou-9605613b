import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck2, Loader2, Unlink } from "lucide-react";
import {
  conectarGoogleAgenda,
  desconectarGoogleAgenda,
  statusGoogleAgenda,
} from "@/lib/google-agenda.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * "Conectar Google Agenda" com escrita: com a conta conectada, as reuniões
 * agendadas no Compass viram evento na agenda da pessoa (com o cliente
 * convidado e Meet), e mudam/cancelam junto.
 */
export function GoogleAgendaConexao({ voltarPara }: { voltarPara: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(statusGoogleAgenda);
  const conectarFn = useServerFn(conectarGoogleAgenda);
  const desconectarFn = useServerFn(desconectarGoogleAgenda);
  const { data } = useQuery({ queryKey: ["google-agenda"], queryFn: () => statusFn() });

  // Volta do Google: ?google=ok | erro (&msg=…).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get("google");
    if (!g) return;
    if (g === "ok")
      toast.success("Google Agenda conectada: as reuniões agendadas vão para a sua agenda.");
    else toast.error(p.get("msg") || "Não foi possível conectar o Google Agenda.");
    p.delete("google");
    p.delete("msg");
    const resto = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${resto ? `?${resto}` : ""}`);
    qc.invalidateQueries({ queryKey: ["google-agenda"] });
  }, [qc]);

  const conectar = useMutation({
    mutationFn: () => conectarFn({ data: { voltarPara } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao conectar"),
  });
  const desconectar = useMutation({
    mutationFn: () => desconectarFn(),
    onSuccess: () => {
      toast.success("Google Agenda desconectada");
      qc.invalidateQueries({ queryKey: ["google-agenda"] });
    },
  });

  if (!data) return null;
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <CalendarCheck2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Google Agenda: criar eventos</h2>
        {data.conectado && <Badge variant="secondary">Conectada</Badge>}
      </div>
      {!data.configurado ? (
        <p className="text-xs text-muted-foreground">
          A integração com o Google ainda não foi configurada pela gestão (faltam as credenciais do
          Google no Compass).
        </p>
      ) : data.conectado ? (
        <>
          <p className="text-xs text-muted-foreground">
            {data.email ?? "Conta conectada"} · as reuniões agendadas no Compass entram na sua
            agenda, com o cliente convidado e link do Meet; mudar ou cancelar no Compass muda lá
            também.
          </p>
          {data.erro && <p className="text-xs text-destructive">{data.erro}</p>}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={desconectar.isPending}
            onClick={() => desconectar.mutate()}
          >
            <Unlink className="mr-1 h-3.5 w-3.5" /> Desconectar
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Conecte uma vez com a sua conta Google: as reuniões que você agenda no Compass passam a
            ser criadas direto na sua agenda, com o cliente convidado e link do Meet.
          </p>
          <Button size="sm" disabled={conectar.isPending} onClick={() => conectar.mutate()}>
            {conectar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Conectar Google Agenda
          </Button>
        </>
      )}
    </Card>
  );
}
