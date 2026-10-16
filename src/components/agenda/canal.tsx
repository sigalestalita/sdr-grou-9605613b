import { Flag, Linkedin, Mail, MessageCircle, Mic, Phone, Video } from "lucide-react";
import type { PassoComCanal } from "./formatos";

/*
 * O ícone sai da etiqueta do playbook antes do canal: áudio e vídeo são
 * WhatsApp para o banco, mas para quem vai gravar são outra tarefa.
 */
export function IconeDoCanal({ passo, className }: { passo: PassoComCanal; className?: string }) {
  const tag = passo.channelTag.toUpperCase();
  const Icone = tag.includes("BREAK-UP")
    ? Flag
    : tag.includes("ÁUDIO")
      ? Mic
      : tag.includes("VÍDEO")
        ? Video
        : passo.channel === "email"
          ? Mail
          : passo.channel === "ligacao"
            ? Phone
            : passo.channel === "linkedin"
              ? Linkedin
              : MessageCircle;
  return <Icone className={className ?? "h-3.5 w-3.5"} aria-hidden />;
}
