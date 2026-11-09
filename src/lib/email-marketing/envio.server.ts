import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PUBLIC_SITE_URL } from "@/lib/propostas/site";
import { renderEmail, type Contato } from "./render";

/*
 * Envio das campanhas de e-mail pelo Resend (conector do Lovable).
 *
 * - iniciarCampanha: monta a lista (segmentação → email_envios, um por e-mail,
 *   sem descadastrados) e põe a campanha "enviando".
 * - processarFila: chamado a cada minuto pelo agendamento. Envia o próximo
 *   lote de cada campanha em envio, respeitando o limite diário configurado
 *   (app_settings.email_limite_diario; o plano gratuito do Resend aceita 100
 *   por dia, contando os e-mails automáticos do Compass) e o limite de 10
 *   chamadas por segundo. Quando acaba a lista, a campanha fica "enviada".
 */
const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const db = () => supabaseAdmin as unknown as SupabaseClient;
type Row = Record<string, unknown>;

export const urlsDoEnvio = (token: string) => ({
  abertura: `${PUBLIC_SITE_URL}/api/public/email/abrir/${token}`,
  clique: (destino: string) =>
    `${PUBLIC_SITE_URL}/api/public/email/clique/${token}?u=${encodeURIComponent(destino)}`,
  descadastro: `${PUBLIC_SITE_URL}/descadastro?t=${token}`,
  descadastroUmClique: `${PUBLIC_SITE_URL}/api/public/email/descadastro?t=${token}`,
});

function chaves() {
  const lovable = process.env.LOVABLE_API_KEY;
  const resend = process.env.RESEND_API_KEY;
  if (!lovable || !resend)
    throw new Error("Resend não configurado (LOVABLE_API_KEY/RESEND_API_KEY)");
  return { lovable, resend };
}

type Campanha = {
  id: string;
  nome: string;
  assunto: string;
  preheader: string | null;
  corpo: string;
  formato: "texto" | "html";
  remetente_nome: string;
  remetente_email: string;
  responder_para: string | null;
  status: string;
  segmento_id: string | null;
};

async function enviarUm(
  c: Campanha,
  contato: Contato,
  token: string | null,
): Promise<{ ok: true; id: string | null } | { ok: false; erro: string; status: number }> {
  const { lovable, resend } = chaves();
  const urls = token ? urlsDoEnvio(token) : null;
  const r = renderEmail({
    assunto: c.assunto,
    preheader: c.preheader,
    corpo: c.corpo,
    formato: c.formato,
    contato,
    urlClique: urls?.clique ?? null,
    urlAbertura: urls?.abertura ?? null,
    urlDescadastro: urls?.descadastro ?? `${PUBLIC_SITE_URL}/descadastro`,
  });
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": resend,
    },
    body: JSON.stringify({
      from: `${c.remetente_nome} <${c.remetente_email}>`,
      to: [contato.email],
      subject: token ? r.assunto : `[TESTE] ${r.assunto}`,
      html: r.html,
      text: r.texto,
      ...(c.responder_para ? { reply_to: c.responder_para } : {}),
      headers: urls
        ? {
            "List-Unsubscribe": `<${urls.descadastroUmClique}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    }),
  });
  if (!res.ok) return { ok: false, erro: (await res.text()).slice(0, 300), status: res.status };
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: j.id ?? null };
}

async function lerCampanha(id: string): Promise<Campanha> {
  const { data, error } = await db().from("email_campanhas").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Campanha não encontrada");
  return data as Campanha;
}

/** Envio de teste para um endereço (sem rastreio, assunto com [TESTE]). */
export async function enviarTeste(campanhaId: string, para: string, nome?: string | null) {
  const c = await lerCampanha(campanhaId);
  const r = await enviarUm(
    c,
    { email: para, nome: nome ?? null, empresa: "Empresa Exemplo" },
    null,
  );
  if (!r.ok) throw new Error(`Resend ${r.status}: ${r.erro}`);
  return { ok: true };
}

/** Monta a lista de destinatários e põe a campanha em envio. */
export async function iniciarCampanha(campanhaId: string) {
  const c = await lerCampanha(campanhaId);
  if (!["rascunho", "agendada", "pausada"].includes(c.status))
    throw new Error("Esta campanha já foi enviada ou cancelada");
  if (!c.assunto.trim() || !c.corpo.trim()) throw new Error("Falta assunto ou conteúdo");
  if (c.status !== "pausada") {
    if (!c.segmento_id) throw new Error("Escolha a segmentação");
    const { data: seg } = await db()
      .from("email_segmentos")
      .select("regras")
      .eq("id", c.segmento_id)
      .single();
    if (!seg) throw new Error("Segmentação não encontrada");
    const { data: lista, error } = await db().rpc("email_segmento_leads", {
      regras: (seg as Row).regras,
      limite: null,
    });
    if (error) throw new Error(error.message);
    const linhas = ((lista ?? []) as Row[]).map((l) => ({
      campanha_id: c.id,
      lead_id: l.lead_id,
      email: String(l.email),
      nome: (l.nome as string) ?? null,
      empresa: (l.empresa as string) ?? null,
    }));
    for (let i = 0; i < linhas.length; i += 1000) {
      const { error: e } = await db()
        .from("email_envios")
        .upsert(linhas.slice(i, i + 1000), {
          onConflict: "campanha_id,email",
          ignoreDuplicates: true,
        });
      if (e) throw new Error(e.message);
    }
    await db()
      .from("email_campanhas")
      .update({
        status: "enviando",
        destinatarios: linhas.length,
        iniciada_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    return { destinatarios: linhas.length };
  }
  await db()
    .from("email_campanhas")
    .update({ status: "enviando", updated_at: new Date().toISOString() })
    .eq("id", c.id);
  return { destinatarios: null };
}

async function limiteDiario(): Promise<number> {
  const { data } = await db()
    .from("app_settings")
    .select("value")
    .eq("key", "email_limite_diario")
    .maybeSingle();
  const v = Number((data as { value?: { valor?: number } } | null)?.value?.valor);
  return Number.isFinite(v) && v > 0 ? v : 80;
}

async function enviadosHoje(): Promise<number> {
  const inicio = new Date();
  // Dia em Brasília (UTC-3).
  inicio.setUTCHours(3, 0, 0, 0);
  if (inicio.getTime() > Date.now()) inicio.setUTCDate(inicio.getUTCDate() - 1);
  const { count } = await db()
    .from("email_envios")
    .select("id", { count: "exact", head: true })
    .gte("enviado_em", inicio.toISOString());
  return count ?? 0;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function processarFila(opts?: { tempoMaxMs?: number }) {
  const inicio = Date.now();
  const tempoMax = opts?.tempoMaxMs ?? 40_000;

  // Agendadas cujo horário chegou começam agora.
  const { data: agendadas } = await db()
    .from("email_campanhas")
    .select("id")
    .eq("status", "agendada")
    .lte("agendada_para", new Date().toISOString());
  for (const a of (agendadas ?? []) as Row[]) {
    try {
      await iniciarCampanha(String(a.id));
    } catch {
      /* fica agendada; aparece na tela */
    }
  }

  const [limite, hoje] = await Promise.all([limiteDiario(), enviadosHoje()]);
  let saldo = Math.max(0, limite - hoje);
  const resumo = { enviados: 0, falhas: 0, suprimidos: 0, concluidas: 0, saldo, limite };

  const { data: campanhas } = await db()
    .from("email_campanhas")
    .select("*")
    .eq("status", "enviando")
    .order("iniciada_em");
  for (const c of (campanhas ?? []) as Campanha[]) {
    const { data: pend } = await db()
      .from("email_envios")
      .select("id, email, nome, empresa, token")
      .eq("campanha_id", c.id)
      .eq("status", "pendente")
      .limit(Math.min(saldo, 300));
    const lista = (pend ?? []) as Row[];
    if (!lista.length) {
      const { count } = await db()
        .from("email_envios")
        .select("id", { count: "exact", head: true })
        .eq("campanha_id", c.id)
        .eq("status", "pendente");
      if (!count) {
        await db()
          .from("email_campanhas")
          .update({ status: "enviada", concluida_em: new Date().toISOString() })
          .eq("id", c.id);
        resumo.concluidas++;
      }
      continue;
    }
    // Quem se descadastrou depois de a lista ser montada não recebe.
    const { data: desc } = await db()
      .from("email_descadastros")
      .select("email")
      .in(
        "email",
        lista.map((l) => String(l.email)),
      );
    const bloqueados = new Set(((desc ?? []) as Row[]).map((d) => String(d.email)));
    for (let i = 0; i < lista.length && saldo > 0; i += 8) {
      if (Date.now() - inicio > tempoMax) break;
      const lote = lista.slice(i, i + 8);
      await Promise.all(
        lote.map(async (l) => {
          if (bloqueados.has(String(l.email))) {
            await db().from("email_envios").update({ status: "suprimido" }).eq("id", String(l.id));
            resumo.suprimidos++;
            return;
          }
          if (saldo <= 0) return;
          saldo--;
          const r = await enviarUm(
            c,
            { email: String(l.email), nome: l.nome as string, empresa: l.empresa as string },
            String(l.token),
          );
          if (r.ok) {
            resumo.enviados++;
            await db()
              .from("email_envios")
              .update({ status: "enviado", enviado_em: new Date().toISOString(), resend_id: r.id })
              .eq("id", String(l.id));
          } else if (r.status === 429) {
            saldo++; // tenta de novo no próximo minuto
          } else {
            resumo.falhas++;
            await db()
              .from("email_envios")
              .update({ status: "falhou", erro: r.erro })
              .eq("id", String(l.id));
          }
        }),
      );
      await espera(1000);
    }
    if (saldo <= 0 || Date.now() - inicio > tempoMax) break;
  }
  return { ...resumo, saldo };
}
