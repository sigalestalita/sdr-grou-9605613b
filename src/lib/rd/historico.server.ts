import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Histórico do RD (anotações e tarefas) nos negócios do Compass, em fatias de
 * páginas. Usado pela tela Migração do RD e pelo hook de migração.
 */
export async function importarPaginasDoHistoricoRd(data: {
  fase: "activities" | "tasks";
  pagina: number;
  paginas: number;
  /** Tarefas: "true" ou "false" (concluídas ou pendentes), para caber no teto de 10 mil. */
  concluidas?: "true" | "false";
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getRdTokenInfo } = await import("@/lib/rd-token.server");
  const { todasAsPaginas } = await import("@/lib/paginar.server");
  const { fetchPaginaDoHistorico, fetchUsuariosRd } = await import("@/lib/rd/rd-api.server");
  const { linhaDaAnotacaoRd, linhaDaTarefaRd } = await import("@/lib/rd/conferencia");
  const { userMatcher, carregarRegrasDeDono } = await import("@/lib/rd/rd-transform.server");
  const db = supabaseAdmin as unknown as SupabaseClient;

  const { token } = await getRdTokenInfo();
  if (!token) throw new Error("RD Station não conectado. Conecte em Configurações.");

  const [negocios, leads, cards, empresas, nomesRd, { data: profiles }, regras] = await Promise.all(
    [
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
      // Cards dos funis de SDR viraram leads: as anotações deles vão para o lead.
      todasAsPaginas<{ id: string; rd_deal_id: string }>(
        (de, ate) =>
          db
            .from("leads")
            .select("id, rd_deal_id")
            .not("rd_deal_id", "is", null)
            .order("id")
            .range(de, ate),
        400_000,
      ),
      // Card que não virou negócio nem lead (CS, parceiros, repescagem,
      // carteira): a anotação vai para a empresa do card.
      todasAsPaginas<{ rd_id: string; rd_org_id: string | null; pipeline: string | null }>(
        (de, ate) =>
          db.from("rd_deals").select("rd_id, rd_org_id, pipeline").order("rd_id").range(de, ate),
        400_000,
      ),
      todasAsPaginas<{ id: string; rd_org_id: string }>(
        (de, ate) =>
          db
            .from("companies")
            .select("id, rd_org_id")
            .not("rd_org_id", "is", null)
            .order("id")
            .range(de, ate),
        400_000,
      ),
      fetchUsuariosRd(token),
      db.from("profiles").select("id, full_name, email"),
      carregarRegrasDeDono(),
    ],
  );
  const negocioDoRd = new Map(negocios.map((n) => [n.rd_deal_id, n.id]));
  const leadDoRd = new Map(leads.map((l) => [l.rd_deal_id, l.id]));
  const cardDoRd = new Map(cards.map((c) => [c.rd_id, c]));
  const empresaDoOrg = new Map(empresas.map((e) => [e.rd_org_id, e.id]));
  const userOf = userMatcher(
    (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>,
    regras,
  );

  let gravadas = 0;
  let semNegocio = 0;
  let nosLeads = 0;
  let nasEmpresas = 0;
  let total: number | null = null;
  let pagina = data.pagina;
  let acabou = false;
  let erro: string | null = null;
  for (let i = 0; i < data.paginas; i++) {
    let lote;
    try {
      lote = await fetchPaginaDoHistorico(
        token,
        data.fase,
        pagina,
        data.concluidas ? { done: data.concluidas } : undefined,
      );
    } catch (e) {
      // limite do RD: para a fatia aqui; a tela espera e continua desta página
      erro = e instanceof Error ? e.message : String(e);
      break;
    }
    total = lote.total ?? total;
    const notasDeLead: Array<Record<string, unknown>> = [];
    const notasDeEmpresa: Array<Record<string, unknown>> = [];
    const linhas = lote.itens.flatMap((item) => {
      const linha = data.fase === "activities" ? linhaDaAnotacaoRd(item) : linhaDaTarefaRd(item);
      if (!linha) return [];
      const rdAutor = (data.fase === "activities" ? item.user_id : item.user_ids?.[0]) ?? null;
      const nomeAutor = rdAutor ? (nomesRd.get(rdAutor) ?? null) : null;
      const autor = nomeAutor ? userOf(nomeAutor) : null;
      const quando = linha.occurred_at ?? new Date().toISOString();
      const dealId = item.deal_id ? negocioDoRd.get(item.deal_id) : undefined;
      if (!dealId) {
        const leadId = item.deal_id ? leadDoRd.get(item.deal_id) : undefined;
        if (leadId) {
          notasDeLead.push({
            lead_id: leadId,
            author_id: autor,
            content: nomeAutor ? `${linha.descricao}\n— ${nomeAutor} (RD)` : linha.descricao,
            created_at: quando,
            rd_activity_id: linha.rd_activity_id,
          });
        } else {
          const card = item.deal_id ? cardDoRd.get(item.deal_id) : undefined;
          const empresaId = card?.rd_org_id ? empresaDoOrg.get(card.rd_org_id) : undefined;
          if (empresaId) {
            notasDeEmpresa.push({
              company_id: empresaId,
              tipo: linha.tipo,
              descricao: linha.descricao,
              occurred_at: quando,
              author_id: autor,
              rd_autor: nomeAutor,
              rd_funil: card?.pipeline ?? null,
              rd_activity_id: linha.rd_activity_id,
            });
          } else semNegocio++;
        }
        return [];
      }
      return [
        {
          ...linha,
          deal_id: dealId,
          occurred_at: quando,
          author_id: autor,
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
    if (notasDeEmpresa.length) {
      const { error: e3 } = await db
        .from("company_activities")
        .upsert(notasDeEmpresa as never, { onConflict: "rd_activity_id", ignoreDuplicates: true });
      if (e3) {
        erro = e3.message;
        break;
      }
      nasEmpresas += notasDeEmpresa.length;
    }
    if (notasDeLead.length) {
      const { error: e2 } = await db
        .from("lead_notes")
        .upsert(notasDeLead as never, { onConflict: "rd_activity_id", ignoreDuplicates: true });
      if (e2) {
        erro = e2.message;
        break;
      }
      nosLeads += notasDeLead.length;
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
    nosLeads,
    nasEmpresas,
    total,
    erro,
  };
}
