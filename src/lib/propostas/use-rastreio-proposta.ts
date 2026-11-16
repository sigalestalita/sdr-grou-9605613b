import { useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { atividadeVisita, registrarVisita } from "@/lib/propostas-publico.functions";

const BATIDA_MS = 15_000;
const DEBOUNCE_SLIDE_MS = 1_200;

function sessaoDoNavegador(token: string): string {
  const chave = `proposta-sessao:${token}`;
  try {
    const ja = sessionStorage.getItem(chave);
    if (ja) return ja;
    const nova = crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem(chave, nova);
    return nova;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/**
 * Registra a visita do cliente: abertura (1 por sessão do navegador), slides
 * vistos (com debounce) e tempo com a página visível (batidas a cada 15 s e ao
 * ocultar/sair da aba). Com `ativo` falso (pré-visualização) não faz nada.
 */
export function useRastreioProposta(token: string, ativo: boolean) {
  const registrar = useServerFn(registrarVisita);
  const atividade = useServerFn(atividadeVisita);
  const estado = useRef<{
    sessao: string;
    pronto: Promise<unknown>;
    visivelDesde: number | null;
    acumuladoMs: number;
    slides: Set<number>;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const enviar = useCallback(() => {
    const e = estado.current;
    if (!e) return;
    const agora = Date.now();
    if (e.visivelDesde != null) {
      e.acumuladoMs += agora - e.visivelDesde;
      e.visivelDesde = document.visibilityState === "visible" ? agora : null;
    }
    const segundos = Math.floor(e.acumuladoMs / 1000);
    const slides = [...e.slides];
    if (segundos === 0 && slides.length === 0) return;
    e.acumuladoMs -= segundos * 1000;
    e.slides.clear();
    void e.pronto
      .then(() => atividade({ data: { token, sessao: e.sessao, slides, segundos } }))
      .catch(() => undefined);
  }, [atividade, token]);

  useEffect(() => {
    if (!ativo) return;
    const sessao = sessaoDoNavegador(token);
    const pronto = registrar({ data: { token, sessao } }).catch(() => undefined);
    estado.current = {
      sessao,
      pronto,
      visivelDesde: document.visibilityState === "visible" ? Date.now() : null,
      acumuladoMs: 0,
      slides: estado.current?.slides ?? new Set(),
      timer: null,
    };
    const batida = setInterval(() => {
      if (document.visibilityState === "visible") enviar();
    }, BATIDA_MS);
    const visibilidade = () => {
      const e = estado.current;
      if (!e) return;
      if (document.visibilityState === "hidden") enviar();
      else if (e.visivelDesde == null) e.visivelDesde = Date.now();
    };
    const saindo = () => enviar();
    document.addEventListener("visibilitychange", visibilidade);
    window.addEventListener("pagehide", saindo);
    return () => {
      clearInterval(batida);
      document.removeEventListener("visibilitychange", visibilidade);
      window.removeEventListener("pagehide", saindo);
      enviar();
      estado.current = null;
    };
  }, [ativo, token, registrar, enviar]);

  /** Slide mostrado (n começa em 1). */
  const viuSlide = useCallback(
    (n: number) => {
      const e = estado.current;
      if (!e) return;
      e.slides.add(n);
      if (e.timer) clearTimeout(e.timer);
      e.timer = setTimeout(enviar, DEBOUNCE_SLIDE_MS);
    },
    [enviar],
  );

  return { viuSlide };
}
