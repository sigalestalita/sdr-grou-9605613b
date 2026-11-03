import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hojeSP } from "@/lib/datas-sp";
import { moedaBr, type ConteudoProposta } from "@/lib/propostas/render";

/*
 * Página do cliente (/proposta/<token>), sem login. Tudo passa por aqui com o
 * service role, sempre filtrando pelo token: quem não tem o link não vê nada.
 */
const db = () => supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;

type Linha = {
  id: string;
  numero: number;
  versao: number;
  status: string;
  deal_id: string;
  conteudo: ConteudoProposta;
  validade_ate: string | null;
  visualizada_em: string | null;
  visualizacoes: number;
  aceita_em: string | null;
  aceite: { nome?: string; cargo?: string } | null;
  recusada_em: string | null;
  enviada_por: string | null;
  created_by: string | null;
};

async function porToken(token: string): Promise<Linha | null> {
  const { data } = await db()
    .from("propostas")
    .select(
      "id, numero, versao, status, deal_id, conteudo, validade_ate, visualizada_em, visualizacoes, aceita_em, aceite, recusada_em, enviada_por, created_by",
    )
    .eq("token", token)
    .maybeSingle();
  return (data as Linha | null) ?? null;
}

function vencida(p: Linha) {
  return !!p.validade_ate && p.validade_ate < hojeSP(new Date());
}

/** Avisa o dono da proposta (sino do Compass). Falha aqui não derruba nada. */
async function avisar(p: Linha, titulo: string, corpo: string) {
  const user = p.enviada_por ?? p.created_by;
  if (!user) return;
  await db()
    .from("notificacoes")
    .insert({
      user_id: user,
      tipo: "proposta",
      titulo: titulo.slice(0, 200),
      corpo: corpo.slice(0, 2000),
      link: `/negocio/${p.deal_id}`,
      deal_id: p.deal_id,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

const tokenZ = z.object({ token: z.string().uuid() });

export const verPropostaPublica = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenZ.extend({ contar: z.boolean().default(true) }).parse(d))
  .handler(async ({ data }) => {
    const p = await porToken(data.token);
    if (!p) return { encontrada: false as const };
    if (data.contar && !["substituida", "cancelada"].includes(p.status)) {
      const agora = new Date().toISOString();
      const primeira = !p.visualizada_em;
      await db()
        .from("propostas")
        .update({
          visualizacoes: (p.visualizacoes ?? 0) + 1,
          ...(primeira ? { visualizada_em: agora } : {}),
          ...(p.status === "enviada" ? { status: "visualizada" } : {}),
        })
        .eq("id", p.id);
      if (primeira && p.status === "enviada") {
        await avisar(
          p,
          `${p.conteudo.cliente.empresa} abriu a proposta nº ${p.numero}`,
          `${moedaBr(p.conteudo.totais.final)} · versão ${p.versao}`,
        );
      }
    }
    return {
      encontrada: true as const,
      numero: p.numero,
      versao: p.versao,
      status: p.status,
      vencida: vencida(p),
      conteudo: p.conteudo,
      aceitaEm: p.aceita_em,
      aceite: p.aceite ? { nome: p.aceite.nome ?? "", cargo: p.aceite.cargo ?? "" } : null,
      recusadaEm: p.recusada_em,
    };
  });

export const TEXTO_CIENCIA =
  "Declaro que li e estou de acordo com as condições, valores e termos desta proposta comercial, e que tenho autorização para aceitá-la em nome da empresa.";

export const aceitarProposta = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    tokenZ
      .extend({
        nome: z.string().trim().min(3).max(160),
        email: z.string().trim().email().max(200),
        cargo: z.string().trim().min(2).max(120),
        documento: z.string().trim().max(30).default(""),
        concordo: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const p = await porToken(data.token);
    if (!p) throw new Error("Proposta não encontrada");
    if (p.status === "aceita") return { ok: true };
    if (["substituida", "cancelada", "recusada"].includes(p.status)) {
      throw new Error("Esta versão da proposta não está mais valendo. Fale com a Grou.");
    }
    if (vencida(p)) throw new Error("A validade desta proposta terminou. Peça uma nova à Grou.");
    const req = getRequest();
    const h = req?.headers;
    const ip =
      h?.get("cf-connecting-ip") ??
      h?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h?.get("x-real-ip") ??
      null;
    const agora = new Date().toISOString();
    const { error } = await db()
      .from("propostas")
      .update({
        status: "aceita",
        aceita_em: agora,
        aceite: {
          nome: data.nome,
          email: data.email,
          cargo: data.cargo,
          documento: data.documento || null,
          ip,
          user_agent: h?.get("user-agent")?.slice(0, 300) ?? null,
          texto_ciencia: TEXTO_CIENCIA,
        },
        updated_at: agora,
      })
      .eq("id", p.id)
      .not("status", "in", "(aceita,substituida,cancelada,recusada)");
    if (error) throw new Error("Não foi possível registrar o aceite. Tente de novo.");
    await db()
      .from("deals")
      .update({ proposta_aceita_em: agora })
      .eq("id", p.deal_id)
      .is("proposta_aceita_em", null);
    await avisar(
      p,
      `Proposta nº ${p.numero} aceita por ${p.conteudo.cliente.empresa}`,
      `${data.nome} (${data.cargo}) aceitou ${moedaBr(p.conteudo.totais.final)}.`,
    );
    return { ok: true };
  });

export const recusarProposta = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    tokenZ.extend({ motivo: z.string().trim().max(1000).default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    const p = await porToken(data.token);
    if (!p) throw new Error("Proposta não encontrada");
    if (!["enviada", "visualizada", "rascunho"].includes(p.status)) return { ok: true };
    const agora = new Date().toISOString();
    await db()
      .from("propostas")
      .update({
        status: "recusada",
        recusada_em: agora,
        recusa_motivo: data.motivo || null,
        updated_at: agora,
      })
      .eq("id", p.id);
    await avisar(
      p,
      `${p.conteudo.cliente.empresa} recusou a proposta nº ${p.numero}`,
      data.motivo ? `Motivo: ${data.motivo}` : "Sem motivo informado.",
    );
    return { ok: true };
  });
