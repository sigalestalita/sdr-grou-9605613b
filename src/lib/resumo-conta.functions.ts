import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Resumo da conta por time: cartões, linha do tempo e resumo em texto (IA) da
 * ficha da empresa, e os alertas de todas as contas para o Início da gestão.
 * O resumo é de todos os times (decisão da gestão), valores inclusive: depois
 * de conferir o login, lê com a chave do servidor.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

const MODELO = "google/gemini-2.5-flash";

export const resumoDaConta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { lerDadosDaConta } = await import("@/lib/empresa/resumo-por-time.server");
    const { montarCartoes, linhaDoTempo } = await import("@/lib/empresa/resumo-por-time");
    const { empresa, dados } = await lerDadosDaConta(db, data.companyId);
    const eventos = linhaDoTempo(dados);
    const cartoes = montarCartoes(dados, eventos);
    const { data: ia } = await db
      .from("resumos_conta")
      .select("texto, gerado_em, gerado_por")
      .eq("company_id", data.companyId)
      .maybeSingle();
    const r = ia as { texto: string; gerado_em: string; gerado_por: string | null } | null;
    let geradoPor: string | null = null;
    if (r?.gerado_por) {
      const { data: p } = await db
        .from("profiles")
        .select("full_name, email")
        .eq("id", r.gerado_por)
        .maybeSingle();
      const pp = p as { full_name?: string | null; email?: string | null } | null;
      geradoPor = pp?.full_name || pp?.email || null;
    }
    const maisRecente = eventos.find((e) => Date.parse(e.quando) <= dados.agora)?.quando ?? null;
    return {
      empresa,
      cartoes,
      eventos: eventos.slice(0, 400),
      totalEventos: eventos.length,
      ia: r
        ? {
            texto: r.texto,
            geradoEm: r.gerado_em,
            geradoPor,
            // Aconteceu algo depois do resumo: a tela oferece gerar de novo.
            desatualizado: !!maisRecente && Date.parse(maisRecente) > Date.parse(r.gerado_em),
          }
        : null,
    };
  });

/** Gera (ou refaz) o resumo em texto da conta a partir dos cartões, só com fatos. */
export const gerarResumoDaConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { lerDadosDaConta } = await import("@/lib/empresa/resumo-por-time.server");
    const { montarCartoes, linhaDoTempo, fatosParaIa } =
      await import("@/lib/empresa/resumo-por-time");
    const { empresa, dados } = await lerDadosDaConta(db, data.companyId);
    const eventos = linhaDoTempo(dados);
    const cartoes = montarCartoes(dados, eventos);
    const fatos = fatosParaIa(empresa, cartoes, eventos, dados.agora);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("IA indisponível: falta a chave da IA no Compass");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        messages: [
          {
            role: "system",
            content: [
              "Você resume a situação de uma conta (empresa) da Grou para quem vai abrir a ficha dela, de qualquer time.",
              "Use só os fatos recebidos. Não invente número, data, nome nem intenção. Se um time não fez nada, diga em poucas palavras.",
              "Escreva em português do Brasil, de 3 a 5 frases curtas, sem título e sem lista: quem é a conta hoje, o que cada time fez de mais relevante e o que pede atenção agora.",
              "Cite valores e datas como vieram. Datas relativas ('há 10 dias') são melhores que datas soltas.",
            ].join(" "),
          },
          { role: "user", content: fatos },
        ],
      }),
    });
    if (!res.ok) throw new Error(`A IA respondeu ${res.status}. Tente de novo em instantes.`);
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const texto = (j.choices?.[0]?.message?.content ?? "").trim();
    if (!texto) throw new Error("A IA não devolveu resumo. Tente de novo.");
    const { error } = await db.from("resumos_conta").upsert({
      company_id: data.companyId,
      texto,
      gerado_em: new Date().toISOString(),
      gerado_por: context.userId,
      modelo: MODELO,
    } as never);
    if (error) throw new Error(error.message);
    return { texto };
  });

export type ContaComAlerta = {
  companyId: string;
  empresa: string;
  alertas: Array<{ area: string; alerta: string; qtd: number }>;
};

/** Contas com algo pedindo ação em algum time (Início da gestão). */
export const contasComAlerta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: gestor } = await db.rpc("is_manager", { _user_id: context.userId });
    if (!gestor) return null;
    const { data, error } = await db.rpc("alertas_das_contas");
    if (error) throw new Error(error.message);
    const porConta = new Map<string, ContaComAlerta>();
    for (const r of (data ?? []) as Array<{
      company_id: string;
      empresa: string;
      area: string;
      alerta: string;
      qtd: number;
    }>) {
      const c = porConta.get(r.company_id) ?? {
        companyId: r.company_id,
        empresa: r.empresa,
        alertas: [],
      };
      c.alertas.push({ area: r.area, alerta: r.alerta, qtd: Number(r.qtd) });
      porConta.set(r.company_id, c);
    }
    // Primeiro as contas com alerta em mais times; depois por nome.
    return [...porConta.values()].sort(
      (a, b) =>
        new Set(b.alertas.map((x) => x.area)).size - new Set(a.alertas.map((x) => x.area)).size ||
        a.empresa.localeCompare(b.empresa),
    );
  });
