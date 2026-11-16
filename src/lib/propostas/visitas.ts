/*
 * Rastreio de visitas à página pública da proposta — parte pura, sem banco.
 * Usada pelo servidor (o que conta e quando avisar) e pelas telas do Compass
 * (resumo por proposta e histórico).
 */

/** Uma sessão nova conta como "voltou a abrir" se a última atividade foi há mais que isto. */
export const HORAS_PARA_RETORNO = 6;

/** Teto por envio de tempo (segundos) e por visita, para um relógio esquecido não inflar a leitura. */
export const MAX_SEGUNDOS_POR_ENVIO = 120;
export const MAX_SEGUNDOS_POR_VISITA = 6 * 3600;

export function ehRetorno(ultimaAtividadeAnterior: string | null, agora: Date): boolean {
  if (!ultimaAtividadeAnterior) return false;
  const antes = new Date(ultimaAtividadeAnterior).getTime();
  if (!Number.isFinite(antes)) return false;
  return agora.getTime() - antes > HORAS_PARA_RETORNO * 3600 * 1000;
}

/** Junta slides vistos (números a partir de 1), sem repetir, em ordem, dentro do total. */
export function mesclarSlides(atuais: number[], novos: number[], total: number): number[] {
  const set = new Set<number>();
  for (const n of [...(atuais ?? []), ...(novos ?? [])]) {
    const v = Math.trunc(Number(n));
    if (v >= 1 && (total <= 0 || v <= total)) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

/** Primeira vez que alguém chega ao último slide: ninguém tinha chegado antes e agora chegou. */
export function chegouAoFimAgora(maiorAntesDeTodos: number, maiorAgora: number, total: number) {
  return total > 0 && maiorAntesDeTodos < total && maiorAgora >= total;
}

export function somarSegundos(atual: number, enviado: number): number {
  const delta = Math.min(Math.max(Math.trunc(enviado) || 0, 0), MAX_SEGUNDOS_POR_ENVIO);
  return Math.min((atual || 0) + delta, MAX_SEGUNDOS_POR_VISITA);
}

/** "iPhone · Safari", "Windows · Chrome"… */
export function dispositivo(ua: string | null | undefined): string {
  if (!ua) return "Desconhecido";
  const s = ua;
  const so = /iPhone/i.test(s)
    ? "iPhone"
    : /iPad/i.test(s)
      ? "iPad"
      : /Android/i.test(s)
        ? /Mobile/i.test(s)
          ? "Android"
          : "Tablet Android"
        : /Windows/i.test(s)
          ? "Windows"
          : /Macintosh|Mac OS X/i.test(s)
            ? "Mac"
            : /CrOS/i.test(s)
              ? "Chromebook"
              : /Linux/i.test(s)
                ? "Linux"
                : "Outro";
  const nav = /Edg\//i.test(s)
    ? "Edge"
    : /OPR\/|Opera/i.test(s)
      ? "Opera"
      : /SamsungBrowser/i.test(s)
        ? "Samsung"
        : /Firefox|FxiOS/i.test(s)
          ? "Firefox"
          : /Chrome|CriOS/i.test(s)
            ? "Chrome"
            : /Safari/i.test(s)
              ? "Safari"
              : "";
  return nav ? `${so} · ${nav}` : so;
}

export function duracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  return r && m < 10 ? `${m} min ${r} s` : `${m} min`;
}

export type VisitaBruta = {
  iniciada_em: string;
  ultima_atividade_em: string | null;
  segundos: number;
  slides_vistos: number[] | null;
  maior_slide: number;
  user_agent: string | null;
};

export type Rastreio = {
  aberturas: number;
  primeira: string | null;
  ultima: string | null;
  segundos: number;
  slidesVistos: number;
  maiorSlide: number;
  totalSlides: number;
};

/** Resumo de todas as visitas de uma proposta. */
export function resumirVisitas(visitas: VisitaBruta[], totalSlides: number): Rastreio {
  let primeira: string | null = null;
  let ultima: string | null = null;
  let segundos = 0;
  let maior = 0;
  let vistos: number[] = [];
  for (const v of visitas) {
    const fim = v.ultima_atividade_em ?? v.iniciada_em;
    if (!primeira || v.iniciada_em < primeira) primeira = v.iniciada_em;
    if (!ultima || fim > ultima) ultima = fim;
    segundos += v.segundos || 0;
    maior = Math.max(maior, v.maior_slide || 0);
    vistos = mesclarSlides(vistos, v.slides_vistos ?? [], totalSlides);
  }
  return {
    aberturas: visitas.length,
    primeira,
    ultima,
    segundos,
    slidesVistos: vistos.length,
    maiorSlide: maior,
    totalSlides,
  };
}
