import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Migração do RD, fase 1: conferir o que chegou e trazer o histórico.
 * Só a gestão; depois de conferido o papel, lê com a chave do servidor para
 * a contagem não depender da visibilidade de quem está olhando.
 */

async function exigirGestao(supabase: unknown, userId: string) {
  const { data } = await (supabase as SupabaseClient).rpc("is_manager", { _user_id: userId });
  if (!data) throw new Error("Apenas a gestão acompanha a migração do RD");
}

export const getConferenciaRd = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestao(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { todasAsPaginas } = await import("@/lib/paginar.server");
    const { conferir } = await import("@/lib/rd/conferencia");
    const { userMatcher, carregarRegrasDeDono, chaveDoDono } =
      await import("@/lib/rd/rd-transform.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const MAX = 400_000;
    const todas = <T>(tabela: string, colunas: string, naoNulo?: string) =>
      todasAsPaginas<T>((de, ate) => {
        let q = db.from(tabela).select(colunas);
        if (naoNulo) q = q.not(naoNulo, "is", null);
        return q.order("id").range(de, ate);
      }, MAX);
    const contar = async (tabela: string, coluna?: string) => {
      let q = db.from(tabela).select("*", { count: "exact", head: true });
      if (coluna) q = q.not(coluna, "is", null);
      const { count } = await q;
      return count ?? 0;
    };

    const [cards, leads, negocios, carteira, csFichas, profiles] = await Promise.all([
      todasAsPaginas<{
        rd_id: string;
        pipeline: string | null;
        stage: string | null;
        status: string | null;
        owner_name: string | null;
        amount: number | null;
        rd_org_id: string | null;
        closed_at: string | null;
      }>(
        (de, ate) =>
          db
            .from("rd_deals")
            .select(
              "rd_id, pipeline, stage, status, owner_name, amount, rd_org_id, closed_at:raw->>closed_at",
            )
            .order("rd_id")
            .range(de, ate),
        MAX,
      ),
      todas<{ rd_deal_id: string }>("leads", "rd_deal_id", "rd_deal_id"),
      todas<{
        rd_deal_id: string;
        status: string;
        amount: number | null;
        closed_at: string | null;
        rd_historico_em: string | null;
      }>("deals", "rd_deal_id, status, amount, closed_at, rd_historico_em", "rd_deal_id"),
      todas<{ rd_deal_id: string | null; companies: { rd_org_id: string | null } | null }>(
        "company_funis",
        "rd_deal_id, companies:company_id(rd_org_id)",
      ),
      todas<{ companies: { rd_org_id: string | null } | null }>(
        "cs_clients",
        "companies:company_id(rd_org_id)",
      ),
      todas<{ id: string; full_name: string | null; email: string | null }>(
        "profiles",
        "id, full_name, email",
      ),
    ]);

    const ganhosCrm = new Map<string, { qtd: number; valor: number }>();
    for (const d of negocios) {
      if (d.status !== "won") continue;
      const ano = (d.closed_at ?? "").slice(0, 4) || "sem data";
      const g = ganhosCrm.get(ano) ?? { qtd: 0, valor: 0 };
      g.qtd++;
      g.valor += Number(d.amount ?? 0) || 0;
      ganhosCrm.set(ano, g);
    }
    const regras = await carregarRegrasDeDono();
    const userOf = userMatcher(profiles, regras);
    const nomeDe = new Map(profiles.map((p) => [p.id, p.full_name || p.email || p.id]));
    const r = conferir(
      cards,
      {
        leads: new Set(leads.map((l) => l.rd_deal_id)),
        negocios: new Set(negocios.map((d) => d.rd_deal_id)),
        carteiraPorCard: new Set(carteira.map((c) => c.rd_deal_id).filter((x): x is string => !!x)),
        carteiraPorOrg: new Set(
          carteira.map((c) => c.companies?.rd_org_id).filter((x): x is string => !!x),
        ),
        csPorOrg: new Set(
          csFichas.map((c) => c.companies?.rd_org_id).filter((x): x is string => !!x),
        ),
        ganhosCrm,
      },
      (nome) => {
        const id = userOf(nome);
        return id ? (nomeDe.get(id) ?? id) : null;
      },
    );

    const [rdEmpresas, empresas, rdContatos, contatos] = await Promise.all([
      contar("rd_organizations"),
      contar("companies", "rd_org_id"),
      contar("rd_contacts"),
      contar("contacts", "rd_contact_id"),
    ]);
    return {
      geradoEm: new Date().toISOString(),
      totais: {
        rdEmpresas,
        empresas,
        rdContatos,
        contatos,
        rdCards: cards.length,
        negociosImportados: negocios.length,
        comHistorico: negocios.filter((d) => d.rd_historico_em).length,
      },
      funis: r.funis,
      // regra: definida pela gestão ("usuario" ou "sem_dono"), ou null = automático
      donos: r.donos.map((d) => {
        const chave = chaveDoDono(d.nome);
        const regra = regras.has(chave) ? (regras.get(chave) ? "usuario" : "sem_dono") : null;
        return { ...d, usuarioId: userOf(d.nome), regra };
      }),
      usuarios: profiles
        .map((p) => ({ id: p.id, nome: p.full_name || p.email || p.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      anos: r.anos,
    };
  });

/**
 * Uma fatia do histórico: lê `paginas` páginas (200 cada) das anotações ou das
 * tarefas do RD, grava em deal_activities o que for de negócio que já está no
 * CRM e devolve onde continuar. A tela chama em laço até acabar as duas fases;
 * pode parar e continuar, e rodar de novo depois que mais negócios chegarem:
 * o que já veio não duplica (rd_activity_id é único).
 */
export const importarHistoricoRd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fase: z.enum(["activities", "tasks"]).default("activities"),
        pagina: z.number().int().min(1).max(1000).default(1),
        paginas: z.number().int().min(1).max(10).default(5),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await exigirGestao(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRdTokenInfo } = await import("@/lib/rd-token.server");
    const { todasAsPaginas } = await import("@/lib/paginar.server");
    const { fetchPaginaDoHistorico, fetchUsuariosRd } = await import("@/lib/rd/rd-api.server");
    const { linhaDaAnotacaoRd, linhaDaTarefaRd } = await import("@/lib/rd/conferencia");
    const { userMatcher, carregarRegrasDeDono } = await import("@/lib/rd/rd-transform.server");
    const db = supabaseAdmin as unknown as SupabaseClient;

    const { token } = await getRdTokenInfo();
    if (!token) throw new Error("RD Station não conectado. Conecte em Configurações.");

    const [negocios, nomesRd, { data: profiles }, regras] = await Promise.all([
      todasAsPaginas<{ id: string; rd_deal_id: string }>(
        (de, ate) =>
          db
            .from("deals")
            .select("id, rd_deal_id")
            .not("rd_deal_id", "is", null)
            .order("id")
            .range(de, ate),
        400_000,
      ),
      fetchUsuariosRd(token),
      db.from("profiles").select("id, full_name, email"),
      carregarRegrasDeDono(),
    ]);
    const negocioDoRd = new Map(negocios.map((n) => [n.rd_deal_id, n.id]));
    const userOf = userMatcher(
      (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>,
      regras,
    );

    let gravadas = 0;
    let semNegocio = 0;
    let total: number | null = null;
    let pagina = data.pagina;
    let acabou = false;
    let erro: string | null = null;
    for (let i = 0; i < data.paginas; i++) {
      let lote;
      try {
        lote = await fetchPaginaDoHistorico(token, data.fase, pagina);
      } catch (e) {
        // limite do RD: para a fatia aqui; a tela espera e continua desta página
        erro = e instanceof Error ? e.message : String(e);
        break;
      }
      total = lote.total ?? total;
      const linhas = lote.itens.flatMap((item) => {
        const linha = data.fase === "activities" ? linhaDaAnotacaoRd(item) : linhaDaTarefaRd(item);
        if (!linha) return [];
        const dealId = item.deal_id ? negocioDoRd.get(item.deal_id) : undefined;
        if (!dealId) {
          semNegocio++;
          return [];
        }
        const rdAutor = (data.fase === "activities" ? item.user_id : item.user_ids?.[0]) ?? null;
        const nomeAutor = rdAutor ? (nomesRd.get(rdAutor) ?? null) : null;
        return [
          {
            ...linha,
            deal_id: dealId,
            occurred_at: linha.occurred_at ?? new Date().toISOString(),
            author_id: nomeAutor ? userOf(nomeAutor) : null,
            rd_autor: nomeAutor,
          },
        ];
      });
      if (linhas.length) {
        const { error: e1 } = await db
          .from("deal_activities")
          .upsert(linhas as never, { onConflict: "rd_activity_id", ignoreDuplicates: true });
        if (e1) {
          erro = e1.message;
          break;
        }
        gravadas += linhas.length;
      }
      pagina++;
      if (!lote.temMais) {
        acabou = true;
        break;
      }
    }

    // Varredura completa das duas coleções: todo negócio do RD que está aqui
    // já tem o histórico que existia no RD.
    if (acabou && data.fase === "tasks") {
      await db
        .from("deals")
        .update({ rd_historico_em: new Date().toISOString() })
        .not("rd_deal_id", "is", null)
        .is("rd_historico_em", null);
    }

    return {
      fase: data.fase,
      proximaPagina: pagina,
      acabou,
      gravadas,
      semNegocio,
      total,
      erro,
    };
  });

/**
 * Preenche o funil dos cards já espelhados (rd_deals.pipeline). A listagem de
 * negócios do RD traz a etapa mas não o funil; o nome vem da lista de funis e
 * etapas do RD, pelo id da etapa guardado no card cru.
 */
export const preencherFunisRd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestao(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRdTokenInfo } = await import("@/lib/rd-token.server");
    const { fetchMapaDeFunis } = await import("@/lib/rd/rd-api.server");
    const { todasAsPaginas } = await import("@/lib/paginar.server");
    const db = supabaseAdmin as unknown as SupabaseClient;

    const { token } = await getRdTokenInfo();
    if (!token) throw new Error("RD Station não conectado. Conecte em Configurações.");
    const mapa = await fetchMapaDeFunis(token);

    const semFunil = await todasAsPaginas<{
      rd_id: string;
      etapa: string | null;
      funil: string | null;
      funil2: string | null;
    }>(
      (de, ate) =>
        db
          .from("rd_deals")
          .select(
            "rd_id, etapa:raw->deal_stage->>_id, funil:raw->deal_pipeline->>_id, funil2:raw->>deal_pipeline_id",
          )
          .is("pipeline", null)
          .order("rd_id")
          .range(de, ate),
      400_000,
    );

    const porNome = new Map<string, string[]>();
    let semMapa = 0;
    for (const c of semFunil) {
      const idFunil = c.funil ?? c.funil2;
      const nome =
        (idFunil && mapa.porFunil.get(idFunil)) || (c.etapa && mapa.porEtapa.get(c.etapa)) || null;
      if (!nome) {
        semMapa++;
        continue;
      }
      porNome.set(nome, [...(porNome.get(nome) ?? []), c.rd_id]);
    }
    let preenchidos = 0;
    for (const [nome, ids] of porNome)
      for (let i = 0; i < ids.length; i += 200) {
        const parte = ids.slice(i, i + 200);
        const { error } = await db.from("rd_deals").update({ pipeline: nome }).in("rd_id", parte);
        if (error) throw new Error(error.message);
        preenchidos += parte.length;
      }
    return {
      funisNoRd: [...mapa.porFunil.values()],
      preenchidos,
      semMapa,
      porFunil: [...porNome.entries()].map(([nome, ids]) => ({ nome, cards: ids.length })),
    };
  });

/**
 * Regra de dono: para onde vão os cards de um nome do RD. `destino` é um
 * usuário do CRM, "sem_dono" (fica só o nome original) ou "auto" (apaga a
 * regra e volta ao casamento por nome/e-mail). Vale na próxima transformação.
 */
export const salvarRegraDeDono = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        nomeRd: z.string().trim().min(1).max(200),
        destino: z.union([z.literal("auto"), z.literal("sem_dono"), z.string().uuid()]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirGestao(context.supabase, context.userId);
    const db = context.supabase as unknown as SupabaseClient;
    if (data.destino === "auto") {
      const { error } = await db.from("rd_regras_de_dono").delete().eq("nome_rd", data.nomeRd);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await db.from("rd_regras_de_dono").upsert(
      {
        nome_rd: data.nomeRd,
        user_id: data.destino === "sem_dono" ? null : data.destino,
        sem_dono: data.destino === "sem_dono",
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "nome_rd" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Preenche o autor do histórico já importado que ficou sem usuário, pelo nome
 * do RD (rd_autor), com as regras de dono e os usuários de agora. Rodar depois
 * de criar usuários ou definir regras.
 */
export const reaplicarDonosNoHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestao(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { todasAsPaginas } = await import("@/lib/paginar.server");
    const { userMatcher, carregarRegrasDeDono } = await import("@/lib/rd/rd-transform.server");
    const db = supabaseAdmin as unknown as SupabaseClient;

    const pendentes = await todasAsPaginas<{ rd_autor: string }>(
      (de, ate) =>
        db
          .from("deal_activities")
          .select("rd_autor")
          .is("author_id", null)
          .not("rd_autor", "is", null)
          .order("id")
          .range(de, ate),
      400_000,
    );
    const nomes = [...new Set(pendentes.map((p) => p.rd_autor))];
    const { data: profiles } = await db.from("profiles").select("id, full_name, email");
    const userOf = userMatcher(
      (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>,
      await carregarRegrasDeDono(),
    );
    let atualizadas = 0;
    const semUsuario: string[] = [];
    for (const nome of nomes) {
      const id = userOf(nome);
      if (!id) {
        semUsuario.push(nome);
        continue;
      }
      const { data, error } = await db
        .from("deal_activities")
        .update({ author_id: id })
        .eq("rd_autor", nome)
        .is("author_id", null)
        .select("id");
      if (error) throw new Error(error.message);
      atualizadas += data?.length ?? 0;
    }
    return { atualizadas, semUsuario };
  });
