/** Utilitários de texto da agenda — separados dos componentes para o fast refresh. */
import type { CadenceStep } from "@/lib/sdr-playbook";

export type PassoComCanal = Pick<CadenceStep, "channel" | "channelTag">;

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const diaCurto = (iso: string) => {
  const d = new Date(iso);
  return `${DIAS_CURTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
};

export function nomeDoCanal(passo: PassoComCanal): string {
  const tag = passo.channelTag.toUpperCase();
  if (tag.includes("BREAK-UP")) return "Break-up";
  if (tag.includes("ÁUDIO")) return "Áudio";
  if (tag.includes("VÍDEO")) return "Vídeo";
  if (tag.includes("INMAIL")) return "InMail";
  switch (passo.channel) {
    case "email":
      return "E-mail";
    case "ligacao":
      return "Ligação";
    case "linkedin":
      return "LinkedIn";
    default:
      return "WhatsApp";
  }
}
