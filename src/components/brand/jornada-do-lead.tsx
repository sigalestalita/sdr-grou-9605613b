import { CalendarDays, CheckCheck, MessageCircle, RefreshCw, Target, Activity } from "lucide-react";

/*
 * A jornada de um lead no Compass, do formulário à renovação. Vitrine do
 * login: as etapas acendem uma a uma (animações em styles.css, 14s por volta)
 * e um ponto de luz desce pela trilha. Com "reduzir movimento", fica parada.
 */
const ETAPAS = [
  { icone: Target, titulo: "Novo lead", detalhe: "Formulário Meta Ads · Demo PDA" },
  {
    icone: MessageCircle,
    titulo: "Qualificado no WhatsApp",
    detalhe: "Empresa · 201–500 colaboradores",
  },
  { icone: CalendarDays, titulo: "Reunião agendada", detalhe: "Quinta, 14h · lead confirmou" },
  { icone: CheckCheck, titulo: "Negócio ganho", detalhe: "Licença PDA · contrato de 12 meses" },
  { icone: Activity, titulo: "Jornada do cliente", detalhe: "Onboarding com o CS · sinal verde" },
  { icone: RefreshCw, titulo: "Renovação", detalhe: "Mais 12 meses de parceria" },
];

export function JornadaDoLead() {
  return (
    <div
      role="img"
      aria-label="Jornada de um lead no Compass: do formulário à renovação"
      className="relative w-full max-w-[470px]"
    >
      <div
        aria-hidden
        className="absolute left-[6px] top-[25px] h-[310px] w-[2px] rounded bg-white/12"
      />
      <div
        aria-hidden
        className="jornada-trilha absolute left-[6px] top-[25px] h-0 w-[2px] rounded bg-[#88d5ce] shadow-[0_0_10px_rgb(136_213_206/0.8)]"
      />
      <div
        aria-hidden
        className="jornada-viaja absolute left-[1px] top-[19px] z-[2] h-3 w-3 rounded-full bg-white shadow-[0_0_14px_4px_rgb(136_213_206/0.9)]"
      />
      <div className="flex flex-col gap-3">
        {ETAPAS.map((e, i) => {
          const Icone = e.icone;
          const ultima = i === ETAPAS.length - 1;
          return (
            <div key={e.titulo} className="flex h-[50px] items-center gap-5">
              <span
                className={`jornada-no-${i} z-[1] h-3.5 w-3.5 flex-none rounded-full border-2 border-white/25 bg-[#0b1650]`}
              />
              <div
                className={`jornada-passo-${i} flex h-[50px] flex-1 items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.06] px-3.5`}
              >
                <span
                  className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] ${
                    ultima ? "bg-[#88d5ce] text-[#05104c]" : "bg-[#88d5ce]/15 text-[#88d5ce]"
                  }`}
                >
                  <Icone className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-white">{e.titulo}</span>
                  <span className="truncate text-xs text-[#c9d2ea]">{e.detalhe}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
