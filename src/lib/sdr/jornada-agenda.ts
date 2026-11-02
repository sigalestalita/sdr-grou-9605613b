/*
 * Jornada da agenda: o que o lead recebe entre o agendamento e a reunião.
 *
 * Pedido da coordenação de SDR (out/26), para o lead chegar aquecido:
 *   1. confirmação, logo depois de agendar;
 *   2. material (case, artigo, e-book), dois dias úteis antes, às 10h;
 *   3. véspera, no dia útil anterior, às 17h — com o material, quando a
 *      reunião foi marcada em cima da hora e o passo 2 não coube;
 *   4. lembrete, uma hora antes.
 *
 * Parte pura: dado quando a reunião foi marcada e quando é, devolve os passos
 * com horário de envio e até quando ainda faz sentido mandar. O envio fica no
 * servidor, que calcula de novo a cada rodada — reagendar muda a reunião e,
 * com ela, a jornada; cancelar tira a reunião e a jornada some.
 */

export type PassoDaJornada =
  | "confirmacao"
  | "material"
  | "vespera"
  | "vespera_material"
  | "lembrete";

export type EnvioPlanejado = {
  passo: PassoDaJornada;
  enviarEm: Date;
  /** Depois disso o passo perdeu o sentido e não sai mais. */
  validoAte: Date;
};

const HORA = 3600_000;
const MIN = 60_000;

/** Partes da data no fuso da operação. */
function partes(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { ano: +v("year"), mes: +v("month"), dia: +v("day"), semana: v("weekday") };
}

/** Deslocamento do fuso em minutos naquela data (ex.: -180 em São Paulo). */
function offsetMin(d: Date, tz: string): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((x) => x.type === "timeZoneName")?.value;
  const m = nome?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return -180;
  return (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0));
}

/** Um horário (hh:mm) num dia do calendário local, como instante. */
function noDia(ano: number, mes: number, dia: number, hora: number, tz: string): Date {
  const utc = Date.UTC(ano, mes - 1, dia, hora, 0);
  return new Date(utc - offsetMin(new Date(utc), tz) * MIN);
}

/** O dia útil `n` dias antes da data, no calendário local. */
function diaUtilAntes(d: Date, n: number, tz: string) {
  let { ano, mes, dia } = partes(d, tz);
  let faltam = n;
  while (faltam > 0) {
    const anterior = new Date(Date.UTC(ano, mes - 1, dia - 1, 12));
    ano = anterior.getUTCFullYear();
    mes = anterior.getUTCMonth() + 1;
    dia = anterior.getUTCDate();
    const semana = anterior.getUTCDay();
    if (semana !== 0 && semana !== 6) faltam--;
  }
  return { ano, mes, dia };
}

export function planejarJornada(opts: {
  agendadoEm: Date;
  reuniaoEm: Date;
  tz?: string;
}): EnvioPlanejado[] {
  const tz = opts.tz ?? "America/Sao_Paulo";
  const { agendadoEm, reuniaoEm } = opts;
  if (reuniaoEm.getTime() <= agendadoEm.getTime()) return [];
  const out: EnvioPlanejado[] = [];

  // Confirmação: na hora; se não saiu em 2h, já não é "logo após agendar".
  out.push({
    passo: "confirmacao",
    enviarEm: agendadoEm,
    validoAte: new Date(Math.min(agendadoEm.getTime() + 2 * HORA, reuniaoEm.getTime())),
  });

  // Material: dois dias úteis antes, às 10h. Só se cabe com folga depois do agendamento.
  const d2 = diaUtilAntes(reuniaoEm, 2, tz);
  const material = noDia(d2.ano, d2.mes, d2.dia, 10, tz);
  const cabeMaterial = material.getTime() >= agendadoEm.getTime() + 3 * HORA;
  if (cabeMaterial) {
    out.push({
      passo: "material",
      enviarEm: material,
      validoAte: new Date(material.getTime() + 4 * HORA),
    });
  }

  // Véspera: dia útil anterior, às 17h. Leva o material quando o passo 2 não coube.
  const d1 = diaUtilAntes(reuniaoEm, 1, tz);
  const vespera = noDia(d1.ano, d1.mes, d1.dia, 17, tz);
  if (vespera.getTime() >= agendadoEm.getTime() + HORA) {
    out.push({
      passo: cabeMaterial ? "vespera" : "vespera_material",
      enviarEm: vespera,
      validoAte: new Date(vespera.getTime() + 3 * HORA),
    });
  }

  // Lembrete: uma hora antes. Marcada para daqui a menos de 1h30, a confirmação basta.
  const lembrete = new Date(reuniaoEm.getTime() - HORA);
  if (lembrete.getTime() >= agendadoEm.getTime() + 30 * MIN) {
    out.push({ passo: "lembrete", enviarEm: lembrete, validoAte: reuniaoEm });
  }
  return out;
}

const SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** Dia da semana, data e horário da reunião, como vão no texto. */
export function quandoPorExtenso(reuniaoEm: Date, tz = "America/Sao_Paulo") {
  const p = partes(reuniaoEm, tz);
  const semana = SEMANA[new Date(Date.UTC(p.ano, p.mes - 1, p.dia, 12)).getUTCDay()];
  const hm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(reuniaoEm);
  const [h, m] = hm.split(":");
  return {
    dia_semana: semana,
    data: `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`,
    horario: m === "00" ? `${+h}h` : `${+h}h${m}`,
  };
}
