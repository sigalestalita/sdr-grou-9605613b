import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { conectarGoogleAgenda } from "@/lib/google-agenda.functions";

/*
 * Agenda que chega só como "Busy".
 *
 * Quem ligou a Google Agenda pelo endereço iCal público vê "Busy" em tudo, sem
 * título nem convidado, e nada se liga a empresa ou contato. A saída mais
 * simples é conectar a conta Google (um clique): a sincronização passa a ler
 * pela API, com título, convidados e link.
 */
export function AvisoAgendaBusy({
  pessoas,
  euId,
  sincronizar,
}: {
  pessoas: Array<{ userId: string; name: string; gcalLastError: string | null }>;
  euId: string | null;
  sincronizar: () => void;
}) {
  const conectarFn = useServerFn(conectarGoogleAgenda);
  const conectar = useMutation({
    mutationFn: () => conectarFn({ data: { voltarPara: "/cs-agenda" } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao conectar"),
  });

  // Volta do Google: sincroniza na hora para os "Busy" virarem as reuniões.
  const jaSincronizou = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get("google");
    if (!g || jaSincronizou.current) return;
    jaSincronizou.current = true;
    if (g === "ok") {
      toast.success("Google conectado. Trazendo as reuniões com título e convidados…");
      sincronizar();
    } else toast.error(p.get("msg") || "Não foi possível conectar o Google.");
    p.delete("google");
    p.delete("msg");
    const resto = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${resto ? `?${resto}` : ""}`);
  }, [sincronizar]);

  const soBusy = pessoas.filter((p) => p.gcalLastError?.includes("Busy"));
  if (!soBusy.length) return null;
  const eu = soBusy.find((p) => p.userId === euId);
  const outros = soBusy.filter((p) => p.userId !== euId);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-[13px]">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        {eu ? (
          <p>
            <b>Sua agenda chega só como “Busy”</b>: foi ligada pelo endereço público do Google, que
            esconde título e convidados. Conecte a sua conta Google para ver as reuniões e ligá-las
            às empresas.
          </p>
        ) : null}
        {outros.length > 0 && (
          <p className={eu ? "mt-1 text-muted-foreground" : ""}>
            Agenda só com “Busy”: {outros.map((o) => o.name).join(", ")}. Cada pessoa conecta a
            própria conta Google aqui na Agenda ou em Integrações.
          </p>
        )}
      </div>
      {eu && (
        <Button size="sm" disabled={conectar.isPending} onClick={() => conectar.mutate()}>
          Conectar Google
        </Button>
      )}
    </div>
  );
}
