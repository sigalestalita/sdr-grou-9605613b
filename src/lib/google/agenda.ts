/*
 * Google Agenda com escrita (OAuth de cada pessoa): partes puras — a URL de
 * autorização e o corpo do evento. A rede fica em agenda.server.ts.
 */
export const ESCOPOS_GOOGLE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export function urlDeAutorizacao(opts: {
  clientId: string;
  redirectUri: string;
  estado: string;
  emailSugerido?: string | null;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: ESCOPOS_GOOGLE.join(" "),
    access_type: "offline",
    // Sempre pede consentimento: é o que garante o refresh_token na volta.
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.estado,
  });
  if (opts.emailSugerido) p.set("login_hint", opts.emailSugerido);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type EventoCompass = {
  /** Id estável da reunião no Compass (vira o requestId do Meet). */
  id: string;
  titulo: string;
  inicio: Date;
  duracaoMin: number;
  descricao?: string | null;
  /** Link já definido (Zoom, Meet próprio…). Sem ele, o Google cria um Meet. */
  link?: string | null;
  convidados: Array<{ email: string; nome?: string | null }>;
  fuso?: string;
};

/** Corpo do evento na API do Google Calendar (events.insert / patch). */
export function corpoDoEvento(e: EventoCompass, criarMeet: boolean) {
  const fuso = e.fuso ?? "America/Sao_Paulo";
  const fim = new Date(e.inicio.getTime() + Math.max(5, e.duracaoMin || 60) * 60000);
  const descricao = [
    e.descricao?.trim() || null,
    e.link ? `Link: ${e.link}` : null,
    "Marcado pelo Compass · Grou",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: e.titulo,
    description: descricao,
    start: { dateTime: e.inicio.toISOString(), timeZone: fuso },
    end: { dateTime: fim.toISOString(), timeZone: fuso },
    ...(e.link ? { location: e.link } : {}),
    // O primeiro de cada e-mail vale (é o que traz o nome).
    attendees: e.convidados
      .filter((c) => c.email && c.email.includes("@"))
      .map((c) => ({ email: c.email.toLowerCase(), displayName: c.nome ?? undefined }))
      .filter((c, i, l) => l.findIndex((x) => x.email === c.email) === i),
    reminders: { useDefault: true },
    extendedProperties: { private: { compass_meeting_id: e.id } },
    ...(criarMeet && !e.link
      ? {
          conferenceData: {
            createRequest: {
              requestId: `compass-${e.id}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
  };
}
