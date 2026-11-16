import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REMETENTE_AVISOS,
  destinatariosDoAviso,
  montarEmailDoAviso,
  type DadosDoAviso,
} from "./avisos-email";

/*
 * Envio dos avisos da proposta por e-mail, pelo mesmo Resend (via conector
 * da Lovable) que os outros e-mails do Compass usam. Nunca lança erro: a
 * página do cliente não pode travar por causa do aviso. Cada tentativa fica
 * em integration_logs (provider "resend", action "proposta_aviso_email").
 *
 * PROPOSTA_AVISOS_EMAIL_SIMULAR=1 monta e registra o e-mail sem mandar.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const TEMPO_MAX_MS = 8_000;

export type PropostaParaAviso = {
  id: string;
  avisos_emails: string[] | null;
  enviada_por: string | null;
  created_by: string | null;
};

type Deps = {
  db: SupabaseClient;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
};

async function registrar(db: SupabaseClient, status: string, detail: Record<string, unknown>) {
  try {
    await db
      .from("integration_logs")
      .insert({ provider: "resend", action: "proposta_aviso_email", status, detail });
  } catch {
    /* log nunca derruba nada */
  }
}

async function emailDoDono(db: SupabaseClient, p: PropostaParaAviso): Promise<string | null> {
  const dono = p.enviada_por ?? p.created_by;
  if (!dono) return null;
  const { data } = await db.from("profiles").select("email").eq("id", dono).maybeSingle();
  return (data as { email: string | null } | null)?.email ?? null;
}

export async function enviarAvisoPorEmail(
  p: PropostaParaAviso,
  dados: DadosDoAviso,
  deps: Deps,
): Promise<{ status: "ok" | "simulado" | "erro" | "sem_destinatario"; para: string[] }> {
  const { db } = deps;
  const env = deps.env ?? process.env;
  const base = { proposta_id: p.id, numero: dados.numero, evento: dados.evento.tipo };
  let para: string[] = [];
  try {
    para = destinatariosDoAviso(
      p.avisos_emails,
      (p.avisos_emails ?? []).length ? null : await emailDoDono(db, p),
    );
    if (para.length === 0) {
      await registrar(db, "skipped", { ...base, motivo: "sem destinatário" });
      return { status: "sem_destinatario", para };
    }
    const { assunto, html, texto } = montarEmailDoAviso(dados);
    if (env["PROPOSTA_AVISOS_EMAIL_SIMULAR"] === "1") {
      await registrar(db, "simulado", { ...base, para, assunto, from: REMETENTE_AVISOS });
      return { status: "simulado", para };
    }
    const lovable = env["LOVABLE_API_KEY"];
    const resend = env["RESEND_API_KEY"];
    if (!lovable || !resend) throw new Error("LOVABLE_API_KEY/RESEND_API_KEY não configuradas");
    const res = await (deps.fetch ?? fetch)(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": resend,
      },
      body: JSON.stringify({ from: REMETENTE_AVISOS, to: para, subject: assunto, html, text: texto }),
      signal: AbortSignal.timeout(TEMPO_MAX_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let id: string | null = null;
    try {
      id = ((await res.json()) as { id?: string })?.id ?? null;
    } catch {
      /* sem corpo */
    }
    await registrar(db, "ok", { ...base, para, assunto, resend_id: id });
    return { status: "ok", para };
  } catch (e) {
    await registrar(db, "error", {
      ...base,
      para,
      erro: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
    });
    return { status: "erro", para };
  }
}
