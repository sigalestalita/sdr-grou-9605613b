import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Assistente flutuante (botão no canto da tela, em todas as páginas).
 * Num chat só:
 *   - perguntas sobre os dados do CRM: ferramentas prontas e uma consulta
 *     genérica às tabelas, sempre com o acesso de quem pergunta;
 *   - ajuda de uso: o guia das telas vai no prompt, junto com a tela atual;
 *   - fazer: abrir negócio, definir itens, gerar proposta (rascunho), criar
 *     relatório e segmentação — sempre depois da confirmação no chat.
 * A conversa fica só no navegador (não é gravada).
 */

const MensagemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

export const perguntarAoAssistente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mensagens: z.array(MensagemSchema).min(1).max(30),
        tela: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const [
      { callAI, TOOLS, execTool },
      { FERRAMENTAS_CRM, executarFerramentaCrm },
      { guiaComoTexto },
      { FERRAMENTAS_ACOES, executarAcao },
    ] = await Promise.all([
      import("@/lib/analytics-chat.functions"),
      import("@/lib/assistente/ferramentas.server"),
      import("@/lib/assistente/guia"),
      import("@/lib/assistente/acoes.server"),
    ]);

    const [{ data: perfil }, { data: papeis }, { data: times }] = await Promise.all([
      db.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db.from("user_teams").select("team").eq("user_id", context.userId),
    ]);
    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

    // Parte que muda a cada pergunta: fica fora do cache do prompt.
    const sistemaVariavel = `Hoje é ${hoje}. Quem pergunta: ${(perfil as { full_name?: string } | null)?.full_name ?? "usuário"} · papéis: ${((papeis ?? []) as Array<{ role: string }>).map((p) => p.role).join(", ") || "—"} · times: ${((times ?? []) as Array<{ team: string }>).map((t) => t.team).join(", ") || "—"}.
Tela aberta agora: ${data.tela ?? "desconhecida"}.`;
    // Parte fixa (regras + guia): igual em todas as perguntas.
    const sistemaFixo = `Você é a assistente do Grou Compass, o CRM da Grou (comercial/SDR, Customer Success, marketing e administrativo).

Você faz três coisas:
1. Responde QUALQUER pergunta sobre os DADOS do CRM. Use primeiro as ferramentas prontas (buscar_registros, consultar_negocios, consultar_carteira_cs, detalhar_empresa, detalhar_lead, consultar_propostas, análise de leads); quando não cobrirem, use descrever_base para achar a tabela e as colunas e consultar_base para ler (lista, contagem exata ou agrupado com soma). Nunca invente números, nomes ou datas: consulte antes. Se ainda assim não der, diga o que falta e em qual tela ver.
2. Ensina a USAR o Compass com base no GUIA abaixo. Se a pessoa perguntar "como faço…" ou "o que é esta tela", responda pelo guia, citando o nome dos botões. Use a tela aberta como contexto. Se o guia não cobre, diga que não sabe em vez de inventar.
3. FAZ pela pessoa, no chat:
   - Proposta: ache o negócio (buscar_registros/consultar_base em deals) ou abra um (criar_negocio); veja o catálogo (catalogo_produtos); defina os itens (definir_itens_negocio); gere a proposta (gerar_proposta). A proposta fica em rascunho: diga que ela revisa e envia pela tela do negócio.
   - Relatório: veja catalogo_relatorios, monte a spec e salve com criar_relatorio; mostre o resumo dos números e o link.
   - Segmentação de e-mail: veja opcoes_segmentacao, rode previa_segmentacao e salve com criar_segmentacao; diga quantos contatos entraram e dê o link.
   REGRA DE OURO: antes de qualquer ferramenta que cria ou altera (criar_negocio, definir_itens_negocio, gerar_proposta, criar_relatorio, criar_segmentacao), mostre um resumo do que vai ser feito (empresa, itens com valores, modelo, filtros, nome) e pergunte "Posso criar?". Só chame com confirmado: true depois de um sim claro da pessoa. Se faltar informação (ex.: valor, condição de pagamento, contato), pergunte antes. Você não envia proposta, não apaga e não muda nada fora dessas ações.

Regras de resposta:
- Português do Brasil, direto e curto. Markdown leve: listas, **negrito** nos números importantes.
- Sempre que citar um lead, empresa, negócio ou tela, ponha o link interno em markdown, ex.: [Acme](/empresas/AB12) ou [Pipeline](/kanban). Use só links que vieram das ferramentas ou rotas do guia.
- Valores em reais no formato brasileiro. Datas dd/mm/aaaa.
- Os dados respeitam o acesso de quem pergunta: se algo vier vazio, pode ser falta de acesso; diga isso.
- Período padrão quando a pessoa não disser: últimos 30 dias (e diga que usou esse período).

- Depois de criar algo, sempre dê o link devolvido pela ferramenta.

ferramentas: buscar_registros, consultar_negocios, consultar_carteira_cs, detalhar_empresa, detalhar_lead, consultar_propostas, descrever_base, consultar_base, catalogo_produtos, criar_negocio, definir_itens_negocio, gerar_proposta, catalogo_relatorios, criar_relatorio, opcoes_segmentacao, previa_segmentacao, criar_segmentacao, e para análise de leads/campanhas: get_analytics, query_leads, compare_dimensions, list_stages.

# GUIA DO COMPASS
${guiaComoTexto()}`;

    const ferramentas = [...FERRAMENTAS_CRM, ...FERRAMENTAS_ACOES, ...TOOLS];
    const nomesCrm = new Set(FERRAMENTAS_CRM.map((f) => f.function.name));
    const nomesAcoes = new Set(FERRAMENTAS_ACOES.map((f) => f.function.name));
    const executar = (nome: string, args: Record<string, unknown>) =>
      nomesAcoes.has(nome)
        ? executarAcao(db, context.userId, nome, args)
        : nomesCrm.has(nome)
          ? executarFerramentaCrm(db, nome, args)
          : execTool(db, nome, args);

    // Com a chave da Anthropic configurada, responde com o Claude.
    const { temClaude, conversarComClaude } = await import("@/lib/assistente/claude.server");
    if (temClaude())
      return conversarComClaude({
        sistemaFixo,
        sistemaVariavel,
        mensagens: data.mensagens,
        ferramentas: ferramentas as never,
        executar,
        maxRodadas: 14,
      });
    const sistema = `${sistemaFixo}\n\n${sistemaVariavel}`;

    type Msg = {
      role: "system" | "user" | "assistant" | "tool";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
      name?: string;
    };
    const mensagens: Msg[] = [
      { role: "system", content: sistema },
      ...data.mensagens.map((m) => ({ role: m.role, content: m.content })),
    ];
    const usadas: string[] = [];

    for (let rodada = 0; rodada < 12; rodada++) {
      const r = await callAI(mensagens as never, ferramentas);
      const msg = r.choices?.[0]?.message;
      if (!msg) throw new Error("A IA não respondeu");
      const chamadas = msg.tool_calls ?? [];
      if (!chamadas.length) return { resposta: msg.content ?? "", ferramentas: usadas };
      mensagens.push({ role: "assistant", content: msg.content ?? null, tool_calls: chamadas });
      for (const c of chamadas) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || "{}");
        } catch {
          // argumentos inválidos: segue com vazio
        }
        usadas.push(c.function.name);
        let resultado: unknown;
        try {
          resultado = await executar(c.function.name, args);
        } catch (e) {
          resultado = { erro: e instanceof Error ? e.message : String(e) };
        }
        mensagens.push({
          role: "tool",
          tool_call_id: c.id,
          name: c.function.name,
          content: JSON.stringify(resultado).slice(0, 30000),
        });
      }
    }
    return {
      resposta:
        "Precisei de consultas demais para essa pergunta. Tente perguntar de forma mais específica.",
      ferramentas: usadas,
    };
  });
