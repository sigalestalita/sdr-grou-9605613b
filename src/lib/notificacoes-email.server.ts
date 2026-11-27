import { montarEmailDaMencao, REMETENTE_MENCAO } from "./notificacoes-email";

/*
 * Envia o e-mail da menção pelo mesmo Resend (conector da Lovable) dos outros
 * avisos do Compass. Nunca lança erro: a menção já foi registrada no sino.
 * Cada envio fica em integration_logs (provider "resend", action
 * "mencao_email"). MENCAO_EMAIL_SIMULAR=1 registra sem mandar.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";

export async function enviarMencaoPorEmail(n: {
  para: string[];
  titulo: string;
  corpo?: string | null;
  link?: string | null;
  rodape?: string;
}): Promise<void> {
  if (!n.para.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const registrar = async (status: string, detail: Record<string, unknown>) => {
    try {
      await supabaseAdmin
        .from("integration_logs")
        .insert({ provider: "resend", action: "mencao_email", status, detail } as never);
    } catch {
      /* log nunca derruba nada */
    }
  };
  let emails: string[] = [];
  try {
    const { data } = await supabaseAdmin.from("profiles").select("email").in("id", n.para);
    emails = [
      ...new Set(
        ((data ?? []) as Array<{ email: string | null }>)
          .map((p) => p.email?.trim().toLowerCase())
          .filter((e): e is string => !!e && e.includes("@")),
      ),
    ];
    if (!emails.length) return;
    const { assunto, html, texto } = montarEmailDaMencao(n);
    if (process.env["MENCAO_EMAIL_SIMULAR"] === "1") {
      await registrar("simulado", { para: emails, assunto });
      return;
    }
    const lovable = process.env["LOVABLE_API_KEY"];
    const resend = process.env["RESEND_API_KEY"];
    if (!lovable || !resend) throw new Error("LOVABLE_API_KEY/RESEND_API_KEY não configuradas");
    // Um e-mail por pessoa: ninguém vê o endereço dos outros.
    for (const para of emails) {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovable}`,
          "X-Connection-Api-Key": resend,
        },
        body: JSON.stringify({
          from: REMETENTE_MENCAO,
          to: [para],
          subject: assunto,
          html,
          text: texto,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await registrar("ok", { para: emails, assunto });
  } catch (e) {
    await registrar("error", {
      para: emails,
      erro: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
    });
  }
}
