import grouLogo from "@/assets/grou-logo.png";
import grouLogoBranco from "@/assets/lidi-logo-white.png";

/*
 * Tela de abertura enquanto o Compass confere a sessão: logo, nome,
 * slogan e uma linha de carregamento. Clara ou escura conforme o tema.
 */
export function Splash() {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-surface">
      <div
        aria-hidden
        className="splash-luz-a pointer-events-none absolute -top-32 left-[6%] h-[520px] w-[640px] rounded-full bg-[#88d5ce] opacity-30 blur-[140px] dark:opacity-10"
      />
      <div
        aria-hidden
        className="splash-luz-b pointer-events-none absolute -bottom-40 right-[3%] h-[560px] w-[700px] rounded-full bg-[#9fb0f0] opacity-30 blur-[150px] dark:bg-[#2a3fb8] dark:opacity-25"
      />
      <div className="relative flex flex-col items-center gap-7 px-6 text-center">
        <img
          src={grouLogo}
          alt="Grou"
          className="splash-surge w-[200px] dark:hidden"
          style={{ animationDelay: "150ms" }}
        />
        <img
          src={grouLogoBranco}
          alt="Grou"
          className="splash-surge hidden w-[200px] dark:block"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="splash-surge pl-[0.42em] text-[13px] font-bold tracking-[0.42em] text-primary"
          style={{ animationDelay: "450ms" }}
        >
          COMPASS CRM
        </span>
        <p
          className="splash-surge text-lg text-muted-foreground"
          style={{ animationDelay: "700ms" }}
        >
          Toda a nossa operação em um só lugar.
        </p>
        <div
          role="progressbar"
          aria-label="Carregando"
          className="splash-surge mt-3 h-[3px] w-40 overflow-hidden rounded-full bg-primary/10"
          style={{ animationDelay: "1000ms" }}
        >
          <div className="splash-carga h-[3px] w-2/5 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
