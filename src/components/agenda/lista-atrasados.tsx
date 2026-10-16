import { useState } from "react";
import { RotateCcw, XCircle } from "lucide-react";
import { pesoDaPrioridade } from "@/lib/fup-agenda";
import { IconeDoCanal } from "./canal";
import { LinhaDeCompromisso, LinkAtender, NomeDoLead, PontoDePrioridade } from "./partes";
import type { Compromisso, LinhaDeCadencia } from "./tipos";

const LOTE = 30;

/**
 * O que ficou para trás, com o que dá para fazer a respeito.
 *
 * Antes a única ação sobre um passo atrasado era "Feito" — e a SDR não fez.
 * Então o número só subia. Aqui cada lead parado tem duas saídas: retomar a
 * trilha a partir de hoje, ou encerrar a cadência porque o lead já seguiu por
 * outro caminho. Atraso vira decisão em vez de acúmulo.
 */
export function ListaDeAtrasados({
  linhas,
  compromissos,
  mostrarDono,
  emAndamento,
  compromissoEmAndamento,
  onRetomar,
  onEncerrar,
  onConcluirCompromisso,
}: {
  linhas: LinhaDeCadencia[];
  compromissos: Compromisso[];
  mostrarDono: boolean;
  emAndamento: string | null;
  compromissoEmAndamento: string | null;
  onRetomar: (leadId: string) => void;
  onEncerrar: (leadId: string) => void;
  onConcluirCompromisso: (item: Compromisso) => void;
}) {
  const [limite, setLimite] = useState(LOTE);
  // Prioridade primeiro; entre iguais, o atraso mais recente, que ainda tem
  // chance de ser recuperado sem soar estranho para o lead.
  const ordenadas = [...linhas].sort(
    (a, b) =>
      pesoDaPrioridade(a.lead.priority) - pesoDaPrioridade(b.lead.priority) ||
      a.situacao.diasParado - b.situacao.diasParado ||
      a.lead.leadName.localeCompare(b.lead.leadName),
  );

  if (ordenadas.length === 0 && compromissos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Nada atrasado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {compromissos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hora marcada que passou · {compromissos.length}
          </h2>
          {compromissos.map((item) => (
            <LinhaDeCompromisso
              key={item.key}
              item={item}
              atrasado
              mostrarDono={mostrarDono}
              ocupado={compromissoEmAndamento === item.key}
              onConcluir={() => onConcluirCompromisso(item)}
            />
          ))}
        </section>
      )}

      {ordenadas.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cadência parada · {ordenadas.length} {ordenadas.length === 1 ? "lead" : "leads"}
            </h2>
            <p className="max-w-xl text-[12px] text-muted-foreground">
              Retomar faz o passo onde o lead parou cair hoje; os seguintes mantêm o espaçamento da
              trilha.
            </p>
          </div>
          {ordenadas.slice(0, limite).map((linha) => (
            <LeadParado
              key={linha.lead.leadId}
              linha={linha}
              mostrarDono={mostrarDono}
              ocupado={emAndamento === linha.lead.leadId}
              onRetomar={() => onRetomar(linha.lead.leadId)}
              onEncerrar={() => onEncerrar(linha.lead.leadId)}
            />
          ))}
          {ordenadas.length > limite && (
            <button
              type="button"
              onClick={() => setLimite((n) => n + LOTE)}
              className="w-full rounded-md border border-border py-2 text-[13px] text-muted-foreground hover:bg-muted"
            >
              Mostrar mais {Math.min(LOTE, ordenadas.length - limite)} — faltam{" "}
              {ordenadas.length - limite}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function LeadParado({
  linha,
  mostrarDono,
  ocupado,
  onRetomar,
  onEncerrar,
}: {
  linha: LinhaDeCadencia;
  mostrarDono: boolean;
  ocupado: boolean;
  onRetomar: () => void;
  onEncerrar: () => void;
}) {
  const { lead, situacao } = linha;
  const [confirmando, setConfirmando] = useState(false);
  const parou = situacao.vencidos[0];
  const dias = situacao.diasParado;

  return (
    <article className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <span className="mt-1.5">
          <PontoDePrioridade prioridade={lead.priority} />
        </span>
        <div className="min-w-0">
          <NomeDoLead
            leadId={lead.leadId}
            nome={lead.leadName}
            empresa={mostrarDono ? `${lead.company ?? "—"} · ${lead.assignedName}` : lead.company}
          />
          {parou && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px]">
              <IconeDoCanal passo={parou} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                Parou no Dia {parou.day} — {parou.title}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right text-[12px] tabular-nums">
        <span className="font-medium text-destructive">
          há {dias} {dias === 1 ? "dia" : "dias"}
        </span>
        <span className="block text-muted-foreground">
          {situacao.vencidos.length}{" "}
          {situacao.vencidos.length === 1 ? "toque vencido" : "toques vencidos"}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {confirmando ? (
          <>
            <span className="text-[12px] text-muted-foreground">Encerrar a cadência?</span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                setConfirmando(false);
                onEncerrar();
              }}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[12px] text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              Encerrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={onRetomar}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[12px] text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retomar hoje
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setConfirmando(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Encerrar
            </button>
            <LinkAtender leadId={lead.leadId} />
          </>
        )}
      </div>
    </article>
  );
}
