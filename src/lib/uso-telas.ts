/*
 * Nome de cada tela do Compass a partir da rota, pelo guia do assistente.
 * Só o servidor usa (o texto do guia não precisa ir para o navegador).
 */
import { TELAS } from "@/lib/assistente/guia";

/** Pedaços de rota que são id (uuid) viram ":id", como no resumo do banco. */
export function rotaSemIds(rota: string): string {
  return rota.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}

const PADROES = TELAS.filter((t) => t.rota.startsWith("/"))
  .map((t) => ({
    nome: t.nome,
    re: new RegExp(
      "^" +
        t.rota
          .split("/")
          .map((p) => (p.startsWith("$") ? "[^/]+" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
          .join("/") +
        "/?$",
    ),
  }))
  // a mais específica primeiro: /whatsapp/ia antes de /whatsapp
  .sort((a, b) => b.re.source.length - a.re.source.length);

/** Nome da tela como aparece no menu, ou a própria rota quando não há nome. */
export function rotuloDaRota(rota: string | null | undefined): string {
  const r = (rota ?? "").split(/[?#]/)[0] || "/";
  return PADROES.find((p) => p.re.test(r))?.nome ?? r;
}
