/**
 * Integração Calendly por usuário (token pessoal).
 * Cada pessoa do CS cola seu Personal Access Token; o servidor usa esse token
 * para ler a agenda daquela pessoa e guardar no banco para a visão do gestor.
 */
const API = "https://api.calendly.com";

type CalendlyUser = {
  uri: string;
  name: string | null;
  email: string | null;
  organization: string | null;
};

async function calendlyFetch(token: string, path: string): Promise<unknown> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendly [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function getCalendlyMe(token: string): Promise<CalendlyUser> {
  const json = (await calendlyFetch(token, "/users/me")) as {
    resource?: { uri?: string; name?: string; email?: string; current_organization?: string };
  };
  const r = json.resource ?? {};
  if (!r.uri) throw new Error("Token do Calendly inválido");
  return {
    uri: r.uri,
    name: r.name ?? null,
    email: r.email ?? null,
    organization: r.current_organization ?? null,
  };
}

export type CalendlyEvent = {
  event_uri: string;
  name: string | null;
  status: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  meeting_url: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  cancel_reason: string | null;
  raw: Record<string, unknown>;
};

function readLocation(loc: unknown): { text: string | null; url: string | null } {
  if (!loc || typeof loc !== "object") return { text: null, url: null };
  const l = loc as Record<string, unknown>;
  const url =
    typeof l["join_url"] === "string"
      ? (l["join_url"] as string)
      : typeof l["location"] === "string" && (l["location"] as string).startsWith("http")
        ? (l["location"] as string)
        : null;
  const text =
    typeof l["location"] === "string"
      ? (l["location"] as string)
      : typeof l["type"] === "string"
        ? (l["type"] as string)
        : null;
  return { text, url };
}

/** Eventos agendados de um usuário dentro da janela informada (ISO). */
export async function listCalendlyEvents(
  token: string,
  userUri: string,
  minStart: string,
  maxStart: string,
): Promise<CalendlyEvent[]> {
  const out: CalendlyEvent[] = [];
  let next: string | null =
    `${API}/scheduled_events?user=${encodeURIComponent(userUri)}` +
    `&min_start_time=${encodeURIComponent(minStart)}&max_start_time=${encodeURIComponent(maxStart)}&count=100`;

  for (let page = 0; page < 10 && next; page++) {
    const json = (await calendlyFetch(token, next)) as {
      collection?: Array<Record<string, unknown>>;
      pagination?: { next_page?: string | null };
    };
    for (const ev of json.collection ?? []) {
      const uri = String(ev["uri"] ?? "");
      if (!uri) continue;
      const { text, url } = readLocation(ev["location"]);
      const cancel = ev["cancellation"] as { reason?: string } | undefined;
      out.push({
        event_uri: uri,
        name: (ev["name"] as string) ?? null,
        status: (ev["status"] as string) ?? null,
        start_time: String(ev["start_time"]),
        end_time: (ev["end_time"] as string) ?? null,
        location: text,
        meeting_url: url,
        invitee_name: null,
        invitee_email: null,
        cancel_reason: cancel?.reason ?? null,
        raw: ev,
      });
    }
    next = json.pagination?.next_page ?? null;
  }

  // Convidados (nome/e-mail) — só para os próximos/últimos eventos, evitando estourar rate limit.
  const slice = out.slice(0, 60);
  await Promise.all(
    slice.map(async (ev) => {
      try {
        const json = (await calendlyFetch(token, `${ev.event_uri}/invitees?count=1`)) as {
          collection?: Array<{ name?: string; email?: string }>;
        };
        const inv = json.collection?.[0];
        if (inv) {
          ev.invitee_name = inv.name ?? null;
          ev.invitee_email = inv.email ?? null;
        }
      } catch {
        /* convidado é opcional */
      }
    }),
  );

  return out;
}
