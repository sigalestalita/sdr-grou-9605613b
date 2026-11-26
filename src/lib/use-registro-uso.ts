import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { registrarUso } from "@/lib/uso.functions";
import { MAX_ROTA, MINUTOS_POR_SINAL } from "@/lib/uso";

/*
 * Grava o uso de quem está logado: a entrada (uma por aba/sessão do
 * navegador), cada tela aberta e, a cada 5 minutos, um sinal de "ativo" —
 * só com a aba à vista e se a pessoa mexeu (mouse, teclado, rolagem, toque)
 * nesse intervalo. Falha de rede não aparece para ninguém.
 */
const CHAVE_SESSAO = "uso:sessao";
const INTERVALO_MS = MINUTOS_POR_SINAL * 60_000;

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
      );
}

export function useRegistroDeUso(userId: string | null | undefined, rota: string) {
  const registrar = useServerFn(registrarUso);
  const sessao = useRef<string | null>(null);
  const ultimaRota = useRef<string | null>(null);
  const ultimaInteracao = useRef(Date.now());

  const enviar = (tipo: "entrada" | "pagina" | "ativo", r: string | null) => {
    if (!sessao.current) return;
    registrar({
      data: { sessao: sessao.current, tipo, rota: r?.slice(0, MAX_ROTA) ?? null },
    }).catch(() => {
      /* uso não é crítico */
    });
  };

  // sessão: uma por aba; troca de usuário na mesma aba abre outra
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    let atual: { id: string; user: string } | null = null;
    try {
      atual = JSON.parse(window.sessionStorage.getItem(CHAVE_SESSAO) ?? "null");
    } catch {
      atual = null;
    }
    if (atual?.user === userId) {
      sessao.current = atual.id;
      return;
    }
    sessao.current = novoId();
    try {
      window.sessionStorage.setItem(
        CHAVE_SESSAO,
        JSON.stringify({ id: sessao.current, user: userId }),
      );
    } catch {
      /* sem storage: vale para esta carga da página */
    }
    ultimaRota.current = null;
    enviar("entrada", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // cada tela aberta (a mesma rota seguida conta uma vez)
  useEffect(() => {
    if (!userId || !sessao.current || ultimaRota.current === rota) return;
    ultimaRota.current = rota;
    enviar("pagina", rota);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, rota]);

  // sinal de ativo
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const mexeu = () => {
      ultimaInteracao.current = Date.now();
    };
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;
    for (const e of eventos) window.addEventListener(e, mexeu, { passive: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaInteracao.current > INTERVALO_MS) return;
      enviar("ativo", window.location.pathname);
    }, INTERVALO_MS);
    return () => {
      for (const e of eventos) window.removeEventListener(e, mexeu);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
