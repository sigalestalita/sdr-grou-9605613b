import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getConfigIaCs, salvarConfigIaCs } from "@/lib/cs-ai.functions";
import { useCurrentRole } from "@/lib/use-role";

/*
 * Liga e desliga a IA do suporte (a IA do CS). É ela que cumpre o que a página
 * de Tickets promete: responde o pedido de suporte até onde o playbook cobre e
 * abre ticket para o que precisa de gente. Vale no número da Grou e, para
 * clientes, nos números pessoais do time (só em pedido de suporte).
 * Só a gestão muda; os outros veem o estado.
 */
export function IaDoSuporte() {
  const role = useCurrentRole();
  const lerFn = useServerFn(getConfigIaCs);
  const salvarFn = useServerFn(salvarConfigIaCs);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ia-cs-config"], queryFn: () => lerFn() });
  const salvar = useMutation({
    mutationFn: (ligada: boolean) =>
      salvarFn({ data: { ...data!.cfg, enabled: ligada, autoReplyEnabled: ligada } }),
    onSuccess: (_r, ligada) => {
      toast.success(ligada ? "IA do suporte ligada" : "IA do suporte desligada");
      qc.invalidateQueries({ queryKey: ["ia-cs-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  if (!data) return null;
  const ligada = data.cfg.enabled && data.cfg.autoReplyEnabled;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-[13px]">
      <Bot className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">IA do suporte {ligada ? "ligada" : "desligada"}</p>
        <p className="text-[12px] text-muted-foreground">
          {ligada
            ? "Responde pedido de suporte de cliente pelo playbook do CS e abre ticket quando precisa de gente. Nos números pessoais, só entra em suporte e sai se o dono escreveu nas últimas 24h."
            : "Desligada, ninguém responde automaticamente e os tickets só nascem à mão."}
          {data.blocosNoPlaybook === 0 &&
            " Sem playbook do CS: ela só reconhece o pedido e abre ticket."}
        </p>
      </div>
      {role.canAccessAll && (
        <Switch
          checked={ligada}
          disabled={salvar.isPending}
          onCheckedChange={(v) => salvar.mutate(v)}
          aria-label="Ligar a IA do suporte"
        />
      )}
    </div>
  );
}
