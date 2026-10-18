import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell } from "lucide-react";
import { listarNotificacoes, marcarNotificacoes } from "@/lib/notificacoes.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Sino do topo: menções, ganhos que chegaram ao ADM, pendências de
 * faturamento, requerimentos. Atualiza a cada minuto; abrir uma notificação
 * marca como lida e leva ao lugar dela.
 */
export function NotificacoesBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listarNotificacoes);
  const marcarFn = useServerFn(marcarNotificacoes);
  const [aberto, setAberto] = useState(false);

  const { data } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });
  const marcar = useMutation({
    mutationFn: (v: { id?: string; todas?: boolean }) => marcarFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  const naoLidas = data?.naoLidas ?? 0;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          aria-label={naoLidas ? `${naoLidas} notificações não lidas` : "Notificações"}
          className="relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-[13px] font-medium">Notificações</p>
          {naoLidas > 0 && (
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => marcar.mutate({ todas: true })}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {(data?.itens ?? []).length === 0 && (
            <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              Nada por aqui.
            </li>
          )}
          {(data?.itens ?? []).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`w-full border-b px-3 py-2 text-left text-[12px] transition-colors hover:bg-muted ${
                  n.lida_em ? "text-muted-foreground" : ""
                }`}
                onClick={() => {
                  if (!n.lida_em) marcar.mutate({ id: n.id });
                  setAberto(false);
                  // link é sempre caminho interno (o banco recusa URL externa)
                  if (n.link?.startsWith("/")) navigate({ to: n.link });
                }}
              >
                <p className={n.lida_em ? "" : "font-medium"}>{n.titulo}</p>
                {n.corpo && <p className="line-clamp-2 text-muted-foreground">{n.corpo}</p>}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
