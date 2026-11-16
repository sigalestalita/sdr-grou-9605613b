import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";

/**
 * Visualizador da apresentação da proposta: cartão 16:9, anterior/próximo,
 * contador, tela cheia, setas do teclado e swipe. Pré-carrega o próximo slide.
 * `onSlide(n)` avisa cada slide mostrado (n começa em 1).
 */
export function ApresentacaoSlides({
  titulo,
  slides,
  onSlide,
}: {
  titulo: string;
  slides: string[];
  onSlide?: (n: number) => void;
}) {
  const total = slides.length;
  const [i, setI] = useState(0);
  const [cheia, setCheia] = useState(false); // tela cheia nativa ou a de reserva (iPhone)
  const [carregado, setCarregado] = useState<Record<number, boolean>>({});
  const caixa = useRef<HTMLDivElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);

  const ir = useCallback(
    (n: number) => setI(() => Math.min(Math.max(n, 0), total - 1)),
    [total],
  );
  const anterior = useCallback(() => setI((x) => Math.max(x - 1, 0)), []);
  const proximo = useCallback(() => setI((x) => Math.min(x + 1, total - 1)), [total]);

  useEffect(() => {
    onSlide?.(i + 1);
    for (const j of [i + 1, i + 2, i - 1]) {
      if (j >= 0 && j < total) {
        const img = new Image();
        img.src = slides[j];
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, total]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (alvo?.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        proximo();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        anterior();
      } else if (e.key === "Escape" && cheia && !document.fullscreenElement) {
        setCheia(false);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [anterior, proximo, cheia]);

  useEffect(() => {
    const mudou = () => setCheia(document.fullscreenElement === caixa.current);
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);

  const alternarTelaCheia = async () => {
    const el = caixa.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (cheia) {
      setCheia(false);
      return;
    }
    if (el.requestFullscreen && document.fullscreenEnabled) {
      await el.requestFullscreen().catch(() => setCheia(true));
    } else {
      setCheia(true); // iPhone: sem tela cheia de elemento, ocupa a janela
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    toque.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const ini = toque.current;
    toque.current = null;
    if (!ini) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ini.x;
    const dy = t.clientY - ini.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) proximo();
      else anterior();
    }
  };

  if (total === 0) return null;
  const botao =
    "grid h-10 w-10 place-items-center rounded-full bg-white/90 text-[#05104c] shadow-md ring-1 ring-black/5 transition hover:bg-white disabled:pointer-events-none disabled:opacity-0";

  return (
    <section aria-label={`Apresentação: ${titulo}`} className="print:hidden">
      {titulo && (
        <h1 className="mb-2 px-1 text-[15px] font-semibold text-[#05104c] sm:text-[17px]">
          {titulo}
        </h1>
      )}
      <div
        ref={caixa}
        className={
          cheia
            ? "fixed inset-0 z-50 flex flex-col bg-[#05070f]"
            : "relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_-12px_rgba(5,16,76,0.25)] ring-1 ring-black/5"
        }
      >
        <div
          className={`relative w-full select-none ${cheia ? "flex-1" : "aspect-video"}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {!carregado[i] && <div className="absolute inset-0 animate-pulse bg-[#e6e8ec]" />}
          <img
            key={slides[i]}
            src={slides[i]}
            alt={`Slide ${i + 1}`}
            draggable={false}
            onLoad={() => setCarregado((c) => ({ ...c, [i]: true }))}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div className="absolute inset-y-0 left-2 flex items-center sm:left-3">
            <button
              type="button"
              aria-label="Slide anterior"
              className={botao}
              disabled={i === 0}
              onClick={anterior}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
          <div className="absolute inset-y-0 right-2 flex items-center sm:right-3">
            <button
              type="button"
              aria-label="Próximo slide"
              className={botao}
              disabled={i === total - 1}
              onClick={proximo}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div
          className={`flex items-center justify-between gap-3 px-3 py-2 ${cheia ? "text-white/80" : "border-t border-black/5 text-[#444]"}`}
        >
          <span className="text-[12.5px] tabular-nums" aria-live="polite">
            {i + 1} / {total}
          </span>
          <div
            className="hidden flex-1 items-center justify-center gap-1 sm:flex"
            aria-hidden={total > 40}
          >
            {total <= 40 &&
              slides.map((_, j) => (
                <button
                  key={j}
                  type="button"
                  aria-label={`Ir para o slide ${j + 1}`}
                  onClick={() => ir(j)}
                  className={`h-1.5 rounded-full transition-all ${j === i ? "w-5 bg-[#05104c]" : "w-1.5 bg-[#05104c]/20 hover:bg-[#05104c]/40"} ${cheia ? (j === i ? "!bg-white" : "!bg-white/30") : ""}`}
                />
              ))}
          </div>
          <button
            type="button"
            onClick={alternarTelaCheia}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium hover:bg-black/5"
            aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}
          >
            {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{cheia ? "Sair" : "Tela cheia"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
