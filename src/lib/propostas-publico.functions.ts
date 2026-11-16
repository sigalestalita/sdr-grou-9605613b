import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hojeSP } from "@/lib/datas-sp";
import { moedaBr, type ConteudoProposta } from "@/lib/propostas/render";
import { chegouAoFimAgora, ehRetorno, mesclarSlides, somarSegundos } from "@/lib/propostas/visitas";

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

/** Caminho no bucket privado propostas-slides, quando a URL é de lá. */
function caminhoNoBucket(url: string): string | null {
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/propostas-slides\/([^?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * O bucket dos slides é privado: na hora de abrir a proposta (sempre pelo
 * token) troca as URLs de lá por links temporários. URLs externas ficam iguais.
 */
async function slidesParaExibir(slides: string[]): Promise<string[]> {
  const caminhos = slides.map(caminhoNoBucket);
  const doBucket = caminhos.filter((c): c is string => !!c);
  if (doBucket.length === 0) return slides;
  const { data } = await db()
    .storage.from("propostas-slides")
    .createSignedUrls(doBucket, 60 * 60 * 12);
  const assinada = new Map<string, string>();
  for (const r of data ?? []) if (r.path && r.signedUrl) assinada.set(r.path, r.signedUrl);
  return slides.map((url, i) => {
    const c = caminhos[i];
    const s = c ? assinada.get(c) : undefined;
    if (!s) return url;
    // Mantém o endereço que o navegador já usa (o da URL gravada).
    try {
      const base = new URL(url);
      const assin = new URL(s);
      return `${base.origin}${assin.pathname}${assin.search}`;
    } catch {
      return s;
    }
  });
}

const tokenZ = z.object({ token: z.string().uuid() });
const sessaoZ = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * Abre a proposta. Não registra visita: quem registra é registrarVisita, uma
 * vez por sessão do navegador (e nunca na pré-visualização). `contar` fica
 * aceito por compatibilidade com links antigos e é ignorado.
 */
export const verPropostaPublica = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenZ.extend({ contar: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const p = await porToken(data.token);
    if (!p) return { encontrada: false as const };
    const ap = p.conteudo.apresentacao;
    const conteudo: ConteudoProposta =
      ap && Array.isArray(ap.slides) && ap.slides.length > 0
        ? { ...p.conteudo, apresentacao: { ...ap, slides: await slidesParaExibir(ap.slides) } }
        : p.conteudo;
    return {
      encontrada: true as const,
      numero: p.numero,
      versao: p.versao,
      status: p.status,
      vencida: vencida(p),
      conteudo,
      aceitaEm: p.aceita_em,
      aceite: p.aceite ? { nome: p.aceite.nome ?? "", cargo: p.aceite.cargo ?? "" } : null,
      recusadaEm: p.recusada_em,
    };
  });

function quemAcessa() {
  const h = getRequest()?.headers;
  const ip =
    h?.get("cf-connecting-ip") ??
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h?.get("x-real-ip") ??
    null;
  return { ip, user_agent: h?.get("user-agent")?.slice(0, 300) ?? null };
}

const naoConta = (status: string) => ["substituida", "cancelada"].includes(status);

/**
 * Início de uma visita (uma por sessão do navegador). Recarregar a página na
 * mesma sessão não soma visualização de novo.
 */
export const registrarVisita = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenZ.extend({ sessao: sessaoZ }).parse(d))
  .handler(async ({ data }) => {
    const p = await porToken(data.token);
    if (!p || naoConta(p.status)) return { ok: false };
    const { data: anteriores } = await db()
      .from("proposta_visitas")
      .select("iniciada_em, ultima_atividade_em")
      .eq("proposta_id", p.id)
      .neq("sessao", data.sessao)
      .order("iniciada_em", { ascending: false })
      .limit(50);
    const ultimaAntes =
      ((anteriores ?? []) as Array<{ iniciada_em: string; ultima_atividade_em: string | null }>)
        .map((v) => v.ultima_atividade_em ?? v.iniciada_em)
        .sort()
        .at(-1) ?? null;
    const agora = new Date();
    const { data: nova } = await db()
      .from("proposta_visitas")
      .upsert(
        {
          proposta_id: p.id,
          sessao: data.sessao,
          ultima_atividade_em: agora.toISOString(),
          ...quemAcessa(),
        },
        { onConflict: "proposta_id,sessao", ignoreDuplicates: true },
      )
      .select("id");
    const novaSessao = (nova ?? []).length > 0;
    if (!novaSessao) return { ok: true, nova: false };

    const primeira = !p.visualizada_em;
    await db()
      .from("propostas")
      .update({
        visualizacoes: (p.visualizacoes ?? 0) + 1,
        ...(primeira ? { visualizada_em: agora.toISOString() } : {}),
        ...(p.status === "enviada" ? { status: "visualizada" } : {}),
      })
      .eq("id", p.id);
    if (primeira && p.status === "enviada") {
      await avisar(
        p,
        `${p.conteudo.cliente.empresa} abriu a proposta nº ${p.numero}`,
        `${moedaBr(p.conteudo.totais.final)} · versão ${p.versao}`,
      );
    } else if (p.status !== "rascunho" && ehRetorno(ultimaAntes, agora)) {
      await avisar(
        p,
        `${p.conteudo.cliente.empresa} voltou a abrir a proposta nº ${p.numero}`,
        `Última visita em ${new Date(ultimaAntes!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${(p.visualizacoes ?? 0) + 1}ª abertura`,
      );
    }
    return { ok: true, nova: true };
  });

/**
 * Atividade durante a visita: slides vistos e tempo com a página visível
 * (em segundos desde o último envio).
 */
export const atividadeVisita = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    tokenZ
      .extend({
        sessao: sessaoZ,
        slides: z.array(z.number().int().min(1).max(500)).max(500).default([]),
        segundos: z.number().int().min(0).max(100_000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const p = await porToken(data.token);
    if (!p || naoConta(p.status)) return { ok: false };
    const { data: v } = await db()
      .from("proposta_visitas")
      .select("id, segundos, slides_vistos, maior_slide")
      .eq("proposta_id", p.id)
      .eq("sessao", data.sessao)
      .maybeSingle();
    const visita = v as {
      id: string;
      segundos: number;
      slides_vistos: number[] | null;
      maior_slide: number;
    } | null;
    if (!visita) return { ok: false };
    const total = p.conteudo.apresentacao?.slides?.length ?? 0;
    const vistos = mesclarSlides(visita.slides_vistos ?? [], data.slides, total);
    const maior = Math.max(visita.maior_slide ?? 0, ...vistos, 0);

    let maiorAntesDeTodos = 0;
    if (total > 0 && maior >= total && (visita.maior_slide ?? 0) < total) {
      const { data: top } = await db()
        .from("proposta_visitas")
        .select("maior_slide")
        .eq("proposta_id", p.id)
        .order("maior_slide", { ascending: false })
        .limit(1)
        .maybeSingle();
      maiorAntesDeTodos = (top as { maior_slide: number } | null)?.maior_slide ?? 0;
    } else {
      maiorAntesDeTodos = total; // nada a avisar
    }

    await db()
      .from("proposta_visitas")
      .update({
        ultima_atividade_em: new Date().toISOString(),
        segundos: somarSegundos(visita.segundos ?? 0, data.segundos),
        slides_vistos: vistos,
        maior_slide: maior,
      })
      .eq("id", visita.id);

    if (p.status !== "rascunho" && chegouAoFimAgora(maiorAntesDeTodos, maior, total)) {
      await avisar(
        p,
        `${p.conteudo.cliente.empresa} viu todos os slides da proposta nº ${p.numero}`,
        `${vistos.length} de ${total} slides · ${p.conteudo.apresentacao?.titulo ?? "apresentação"}`,
      );
    }
    return { ok: true };
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
