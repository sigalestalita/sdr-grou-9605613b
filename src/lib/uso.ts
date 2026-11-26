/*
 * Logs de uso do Compass — parte pura: quem pode ver e formatação. O nome
 * das telas fica em uso-telas.ts; gravação e leitura, em uso.functions.ts.
 */
/**
 * Quem vê os logs de uso de todos os usuários. É uma lista de e-mails, não um
 * papel: super admin e gestão não ganham isso por tabela.
 */
export const ACESSO_LOGS_USO = ["talita.sigales@grougp.com.br"];

export function podeVerLogsDeUso(email: string | null | undefined): boolean {
  return !!email && ACESSO_LOGS_USO.includes(email.trim().toLowerCase());
}

export const MINUTOS_POR_SINAL = 5;
export const MAX_ROTA = 300;

/** 135 → "2 h 15 min"; 0 → "—". */
export function formatarMinutos(min: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
