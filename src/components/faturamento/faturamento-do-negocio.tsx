import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Receipt } from "lucide-react";
import { completarDadosGanho, getFaturamentoNegocio } from "@/lib/faturamento.functions";
import { registrarAtividade } from "@/lib/comercial-negocio.functions";
import {
  criarLicencasDoNegocio,
  criarRequerimentoDoNegocio,
  listarLicencas,
  listarRequerimentos,
  mudarStatusLicenca,
} from "@/lib/requerimentos.functions";
import { STATUS_REQUERIMENTO } from "@/lib/requerimentos/regras";
import { InscreverEmTurma } from "@/components/faturamento/contrato-e-turma";
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

      <Execucao dealId={dealId} podeFaturar={data.podeEditar} />

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

const STATUS_LICENCA: Record<string, string> = {
  a_solicitar: "a solicitar",
  solicitado: "solicitada à PDA",
  liberado: "liberada",
  cancelado: "cancelada",
};
const ROTULO_REQ = Object.fromEntries(STATUS_REQUERIMENTO.map((s) => [s.v, s.l]));

/**
 * O que precisa acontecer para entregar: o requerimento de serviço (comercial
 * abre, ADM prepara, trainer executa) e a liberação das licenças PDA.
 */
function Execucao({ dealId, podeFaturar }: { dealId: string; podeFaturar: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reqFn = useServerFn(listarRequerimentos);
  const licFn = useServerFn(listarLicencas);
  const criarReqFn = useServerFn(criarRequerimentoDoNegocio);
  const criarLicFn = useServerFn(criarLicencasDoNegocio);
  const statusLicFn = useServerFn(mudarStatusLicenca);
  const { data: reqs } = useQuery({
    queryKey: ["requerimentos", "negocio", dealId],
    queryFn: () => reqFn({ data: { dealId } }),
  });
  const { data: lics } = useQuery({
    queryKey: ["licencas", dealId],
    queryFn: () => licFn({ data: { dealId } }),
  });
  const recarrega = () => {
    qc.invalidateQueries({ queryKey: ["licencas"] });
    qc.invalidateQueries({ queryKey: ["requerimentos"] });
  };
  const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro");

  const abrirReq = useMutation({
    mutationFn: () => criarReqFn({ data: { dealId } }),
    onSuccess: (r) => navigate({ to: "/requerimento/$id", params: { id: r.id } }),
    onError: erro,
  });
  const pedirLic = useMutation({
    mutationFn: () => criarLicFn({ data: { dealId } }),
    onSuccess: (r) => {
      toast.success(r.criadas ? `${r.criadas} licença(s) para solicitar` : "Nenhum item PDA novo");
      recarrega();
    },
    onError: erro,
  });
  const statusLic = useMutation({
    mutationFn: (v: { id: string; status: "solicitado" | "liberado" }) => statusLicFn({ data: v }),
    onSuccess: recarrega,
    onError: erro,
  });

  return (
    <div className="space-y-2 border-t pt-2 text-[12px]">
      <p className="font-medium">Execução</p>
      {(reqs?.itens ?? []).map((r) => (
        <Link
          key={r.id}
          to="/requerimento/$id"
          params={{ id: r.id }}
          className="flex justify-between gap-2 rounded border px-2 py-1 hover:border-primary/40"
        >
          <span className="truncate">
            Requerimento nº {r.numero} · {r.servico}
          </span>
          <span className="shrink-0 text-muted-foreground">{ROTULO_REQ[r.status] ?? r.status}</span>
        </Link>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={abrirReq.isPending}
        onClick={() => abrirReq.mutate()}
      >
        {abrirReq.isPending ? "Abrindo…" : "Abrir requerimento de serviço"}
      </Button>
      <InscreverEmTurma dealId={dealId} />

      {(lics?.itens ?? []).length > 0 && (
        <ul className="space-y-1">
          {lics?.itens.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={l.paraConferir ? "text-amber-700 dark:text-amber-400" : undefined}>
                {l.descricao} · {STATUS_LICENCA[l.status] ?? l.status}
                {l.paraConferir ? " — conferir na PDA" : ""}
              </span>
              {podeFaturar && l.status === "a_solicitar" && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => statusLic.mutate({ id: l.id, status: "solicitado" })}
                >
                  marcar solicitada
                </button>
              )}
              {podeFaturar && l.status === "solicitado" && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => statusLic.mutate({ id: l.id, status: "liberado" })}
                >
                  marcar liberada
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeFaturar && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pedirLic.isPending}
          onClick={() => pedirLic.mutate()}
        >
          Pedir liberação das licenças PDA do negócio
        </Button>
      )}
    </div>
  );
}
