import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Receipt } from "lucide-react";
import { completarDadosGanho, getFaturamentoNegocio } from "@/lib/faturamento.functions";
import { registrarAtividade } from "@/lib/comercial-negocio.functions";
import { moeda } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const dataBr = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : "—";

/**
 * O que aconteceu depois do ganho, visto do negócio: o ADM conferiu? faturou?
 * o cliente pagou? E, se o ADM devolveu com pendência, o comercial responde
 * aqui mesmo — em vez de o vai e vem acontecer por e-mail.
 */
export function FaturamentoDoNegocio({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getFaturamentoNegocio);
  const completarFn = useServerFn(completarDadosGanho);
  const atividadeFn = useServerFn(registrarAtividade);
  const [resposta, setResposta] = useState("");

  const { data } = useQuery({
    queryKey: ["faturamento", "negocio", dealId],
    queryFn: () => fn({ data: { dealId } }),
  });

  const responder = useMutation({
    mutationFn: async () => {
      // A resposta vira histórico; resolver tira a pendência da fila do ADM.
      await completarFn({ data: { dealId, resolverPendencia: true } });
      if (resposta.trim()) {
        await atividadeFn({
          data: { dealId, tipo: "nota", descricao: `Resposta ao ADM: ${resposta.trim()}` },
        });
      }
    },
    onSuccess: () => {
      toast.success("Pendência respondida");
      setResposta("");
      qc.invalidateQueries({ queryKey: ["faturamento"] });
      qc.invalidateQueries({ queryKey: ["negocio", dealId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (!data) return null;
  const n = data.negocio as Record<string, unknown>;
  const notas = data.faturas.filter((f) => f.status === "emitida");
  const etapa = n.faturado_em
    ? "Faturado"
    : n.adm_checked_at
      ? "Conferido pelo ADM — a faturar"
      : n.adm_pendencia
        ? "Devolvido pelo ADM"
        : "Aguardando conferência do ADM";

  return (
    <section className="surface-panel space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label flex items-center gap-1">
          <Receipt className="h-3.5 w-3.5" /> Faturamento
        </h2>
        {data.podeEditar && (
          <Link to="/faturamento" className="text-[11px] text-primary hover:underline">
            Abrir fila
          </Link>
        )}
      </div>
      <p className="flex items-center gap-1 text-[13px]">
        {n.faturado_em ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : n.adm_pendencia ? (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        ) : null}
        {etapa}
      </p>

      {n.adm_pendencia ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[12px]">
          <p>
            <span className="font-medium">O ADM precisa de:</span> {String(n.adm_pendencia)}
          </p>
          <Textarea
            rows={2}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="Responda aqui (vira histórico do negócio)"
          />
          <Button size="sm" disabled={responder.isPending} onClick={() => responder.mutate()}>
            {responder.isPending ? "Enviando…" : "Responder e devolver ao ADM"}
          </Button>
        </div>
      ) : null}

      {notas.length > 0 && (
        <ul className="space-y-2 text-[12px]">
          {notas.map((f) => (
            <li key={f.id} className="rounded border px-2 py-1.5">
              <p className="flex justify-between gap-2">
                <span className="font-medium">NF {f.numero_nf}</span>
                <span>{moeda(Number(f.valor_bruto))}</span>
              </p>
              <p className="text-muted-foreground">Emitida em {dataBr(f.emitida_em)}</p>
              <ul className="mt-1 space-y-0.5">
                {[...f.fatura_parcelas]
                  .sort((a, b) => a.numero - b.numero)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 text-[11px]">
                      <span>
                        {p.numero}ª · vence {dataBr(p.vencimento)}
                      </span>
                      <span className={p.pago_em ? "text-emerald-600" : "text-muted-foreground"}>
                        {p.pago_em ? `paga ${dataBr(p.pago_em)}` : moeda(Number(p.valor))}
                      </span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
