import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import {
  listOportunidadesDoCliente,
  sinalizarOportunidade,
  TIPOS_OPORTUNIDADE,
} from "@/lib/oportunidades.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  aberta: "No funil, sem dono",
  assumida: "No funil, com o executivo",
  descartada: "Descartada",
};

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * O analista de CS sinaliza a oportunidade que viu na carteira. A sinalização
 * já vira card no funil certo (recompra ou cross sell), na primeira etapa e no
 * nome do responsável comercial da conta. Aqui o CS só passa o que enxergou,
 * com o contexto; quem negocia é o executivo.
 */
export function CsOportunidadePanel({ clientUid }: { clientUid: string }) {
  const listFn = useServerFn(listOportunidadesDoCliente);
  const sinalizarFn = useServerFn(sinalizarOportunidade);
  const qc = useQueryClient();

  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS_OPORTUNIDADE)[number]["valor"]>("recompra");
  const [motivo, setMotivo] = useState("");
  const [produto, setProduto] = useState("");
  const [valor, setValor] = useState("");

  const { data } = useQuery({
    queryKey: ["cs-oportunidades", clientUid],
    queryFn: () => listFn({ data: { clientUid } }),
  });

  const sinalizar = useMutation({
    mutationFn: () =>
      sinalizarFn({
        data: {
          clientUid,
          tipo,
          motivo: motivo.trim(),
          produtoSugerido: produto.trim() || null,
          valorEstimado: valor ? Number(valor) : null,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.temDono
          ? "Card criado no funil da carteira, com o executivo responsável"
          : "Card criado no funil da carteira — a conta não tem executivo, ficou na fila",
      );
      setAberto(false);
      setMotivo("");
      setProduto("");
      setValor("");
      qc.invalidateQueries({ queryKey: ["cs-oportunidades", clientUid] });
      qc.invalidateQueries({ queryKey: ["cs-client", clientUid] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const lista = data?.oportunidades ?? [];
  const ajuda = TIPOS_OPORTUNIDADE.find((t) => t.valor === tipo)?.ajuda;

  return (
    <div className="space-y-3">
      {!aberto && (
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          <TrendingUp className="mr-1 h-3.5 w-3.5" /> Sinalizar oportunidade
        </Button>
      )}

      {aberto && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Tipo</Label>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS_OPORTUNIDADE.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  onClick={() => setTipo(t.valor)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    tipo === t.valor
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
            {ajuda && <p className="text-[11px] text-muted-foreground">{ajuda}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">O que você viu</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Créditos acabando, time novo entrando, dor que outro produto resolve…"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Produto sugerido</Label>
              <Input
                value={produto}
                onChange={(e) => setProduto(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Valor estimado</Label>
              <Input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={motivo.trim().length < 3 || sinalizar.isPending}
              onClick={() => sinalizar.mutate()}
            >
              {sinalizar.isPending ? "Enviando…" : "Sinalizar ao comercial"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Entra como card no funil da carteira, no nome do executivo responsável pela conta.
          </p>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nenhuma oportunidade sinalizada para este cliente.
        </p>
      ) : (
        <ul className="divide-y">
          {/* Empilhado: este painel vive numa coluna estreita, e em linha o selo
              de status espremia o texto até ele quebrar letra por letra. */}
          {lista.map((o) => (
            <li key={o.id} className="space-y-1 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[12px] font-medium">
                  {TIPOS_OPORTUNIDADE.find((t) => t.valor === o.tipo)?.rotulo ?? o.tipo}
                  {o.produtoSugerido ? ` · ${o.produtoSugerido}` : ""}
                </p>
                {o.valorEstimado ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {moeda(o.valorEstimado)}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{o.motivo}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`text-[9px] ${
                    o.status === "assumida"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : o.status === "aberta"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : ""
                  }`}
                >
                  {STATUS_LABEL[o.status] ?? o.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(o.sinalizadaEm), "dd/MM/yyyy", { locale: ptBR })}
                  {o.sinalizadaPor ? ` · ${o.sinalizadaPor}` : ""}
                </span>
              </div>
              {o.assumidaPor && (
                <p className="text-[10px] text-muted-foreground">Com {o.assumidaPor}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
