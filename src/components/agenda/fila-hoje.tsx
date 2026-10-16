import { useState } from "react";
import { AlertTriangle, Check, Copy, ScrollText, Timer } from "lucide-react";
import { toast } from "sonner";
import { preencherRoteiro, temSla, type PassoCompleto } from "@/lib/fup-agenda";
import { IconeDoCanal } from "./canal";
import { diaCurto } from "./formatos";
import { nomeDoCanal } from "./formatos";
import {
  LinhaDeCompromisso,
  LinkAtender,
  NomeDoLead,
  PontoDePrioridade,
  ProgressoDaTrilha,
} from "./partes";
import type { Compromisso, LinhaDeCadencia } from "./tipos";

/**
 * A tela de manhã da SDR: quem tocar hoje, em que ordem, por qual canal.
 *
 * Um lead é uma linha, e os toques que a trilha pede para ele hoje viram uma
 * lista de verificação dentro dela. O que vem depois aparece numa linha só,
 * em vez de cards espalhados pelas colunas dos outros dias.
 */
export function FilaDeHoje({
  linhas,
  compromissos,
  mostrarDono,
  nomeDaSdr,
  atrasados,
  passoEmAndamento,
  compromissoEmAndamento,
  onConcluirPasso,
  onConcluirCompromisso,
  onVerAtrasados,
}: {
  linhas: LinhaDeCadencia[];
  compromissos: Compromisso[];
  mostrarDono: boolean;
  nomeDaSdr: string | null;
  atrasados: number;
  passoEmAndamento: string | null;
  compromissoEmAndamento: string | null;
  onConcluirPasso: (leadId: string, stepId: string) => void;
  onConcluirCompromisso: (item: Compromisso) => void;
  onVerAtrasados: () => void;
}) {
  const vazio = linhas.length === 0 && compromissos.length === 0;

  return (
    <div className="space-y-6">
      {vazio && (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm font-medium">Nenhum toque para hoje.</p>
          {atrasados > 0 && (
            <button
              type="button"
              onClick={onVerAtrasados}
              className="mt-1 text-[13px] text-primary hover:underline"
            >
              Há {atrasados} {atrasados === 1 ? "lead parado" : "leads parados"} em Atrasados.
            </button>
          )}
        </div>
      )}

      {compromissos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Com hora marcada · {compromissos.length}
          </h2>
          {compromissos.map((item) => (
            <LinhaDeCompromisso
              key={item.key}
              item={item}
              mostrarDono={mostrarDono}
              ocupado={compromissoEmAndamento === item.key}
              onConcluir={() => onConcluirCompromisso(item)}
            />
          ))}
        </section>
      )}

      {linhas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cadência de hoje · {linhas.length} {linhas.length === 1 ? "lead" : "leads"}
          </h2>
          {linhas.map((linha) => (
            <LeadDeHoje
              key={linha.lead.leadId}
              linha={linha}
              mostrarDono={mostrarDono}
              nomeDaSdr={nomeDaSdr}
              passoEmAndamento={passoEmAndamento}
              onConcluirPasso={onConcluirPasso}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function LeadDeHoje({
  linha,
  mostrarDono,
  nomeDaSdr,
  passoEmAndamento,
  onConcluirPasso,
}: {
  linha: LinhaDeCadencia;
  mostrarDono: boolean;
  nomeDaSdr: string | null;
  passoEmAndamento: string | null;
  onConcluirPasso: (leadId: string, stepId: string) => void;
}) {
  const { lead, situacao } = linha;
  const pendentes = situacao.hoje.filter((p) => !p.doneAt);
  const slaCorrendo = pendentes.some(temSla);
  const resolvido = pendentes.length === 0;

  return (
    <article
      className={`rounded-lg border bg-card p-3 ${resolvido ? "border-border opacity-70" : "border-border"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1.5">
            <PontoDePrioridade prioridade={lead.priority} />
          </span>
          <NomeDoLead
            leadId={lead.leadId}
            nome={lead.leadName}
            empresa={lead.company}
            etapa={lead.stageName}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {slaCorrendo && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              <Timer className="h-3 w-3" /> SLA 15 min
            </span>
          )}
          {mostrarDono && (
            <span className="text-[11px] text-muted-foreground">{lead.assignedName}</span>
          )}
          <ProgressoDaTrilha situacao={situacao} />
        </div>
      </header>

      <ul className="mt-2 divide-y divide-border rounded-md border border-border">
        {situacao.hoje.map((passo) => (
          <ToqueDeHoje
            key={passo.id}
            passo={passo}
            ocupado={passoEmAndamento === `${lead.leadId}:${passo.id}`}
            roteiro={preencherRoteiro(passo.script, {
              nome: lead.leadName,
              empresa: lead.company,
              sdr: nomeDaSdr,
            })}
            onConcluir={() => onConcluirPasso(lead.leadId, passo.id)}
          />
        ))}
      </ul>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {situacao.vencidos.length > 0 && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {situacao.vencidos.length}{" "}
              {situacao.vencidos.length === 1 ? "toque atrasado" : "toques atrasados"}
            </span>
          )}
          <span className="truncate">
            {situacao.depois
              ? `Depois: ${diaCurto(situacao.depois.dueAt)} · Dia ${situacao.depois.day} — ${situacao.depois.title}`
              : "Último toque da trilha"}
          </span>
        </div>
        <LinkAtender leadId={lead.leadId} />
      </footer>
    </article>
  );
}

function ToqueDeHoje({
  passo,
  roteiro,
  ocupado,
  onConcluir,
}: {
  passo: PassoCompleto;
  roteiro: string;
  ocupado: boolean;
  onConcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const feito = !!passo.doneAt;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(roteiro);
      toast.success("Roteiro copiado");
    } catch {
      toast.error("Não deu para copiar — selecione o texto e copie à mão");
    }
  };

  return (
    <li className="px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        {/* Um toque registrado vira touch no histórico do lead; não se desmarca daqui. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={feito}
          aria-label={feito ? `${passo.title}: feito` : `Marcar ${passo.title} como feito`}
          disabled={feito || ocupado}
          onClick={onConcluir}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-default ${
            feito
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground/50 hover:border-primary hover:bg-primary/10 disabled:opacity-50"
          }`}
        >
          {feito && <Check className="h-3.5 w-3.5" />}
        </button>
        <span
          className="inline-flex w-24 shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground"
          title={passo.channelTag}
        >
          <IconeDoCanal passo={passo} />
          {nomeDoCanal(passo)}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${feito ? "text-muted-foreground line-through" : ""}`}
        >
          {passo.title}
        </span>
        {passo.script && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ScrollText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{aberto ? "Fechar roteiro" : "Roteiro"}</span>
          </button>
        )}
      </div>
      {aberto && (
        <div className="mt-2 rounded-md bg-muted/60 p-2.5 pl-[30px] sm:ml-[30px] sm:pl-2.5">
          <p className="whitespace-pre-line text-[13px] leading-relaxed">{roteiro}</p>
          <button
            type="button"
            onClick={copiar}
            className="mt-2 inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar roteiro
          </button>
        </div>
      )}
    </li>
  );
}
