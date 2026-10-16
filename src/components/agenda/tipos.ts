import type { LeadNaCadencia, SituacaoDoLead } from "@/lib/fup-agenda";

/** Um lead da trilha com a situação dele já calculada para o momento da tela. */
export type LinhaDeCadencia = { lead: LeadNaCadencia; situacao: SituacaoDoLead };

/**
 * Follow-up que não é passo da trilha: agendado à mão, sequência automática
 * de WhatsApp ou touch registrado com data. Tem hora marcada de verdade.
 */
export type Compromisso = {
  key: string;
  kind: "manual" | "auto" | "touch";
  touchId?: string;
  done: boolean;
  doneAt?: string | null;
  dueAt: string;
  leadId: string;
  leadName: string;
  company: string | null;
  priority: string | null;
  stageName: string | null;
  assignedTo: string | null;
  assignedName: string;
  title: string;
  subtitle: string | null;
};
