import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Assistente flutuante (botão no canto da tela, em todas as páginas).
 * Duas funções num chat só:
 *   - perguntas sobre os dados do CRM: responde chamando ferramentas que
 *     consultam com o acesso de quem pergunta;
 *   - ajuda de uso: o guia das telas vai no prompt, junto com a tela atual.
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
    ] = await Promise.all([
      import("@/lib/analytics-chat.functions"),
      import("@/lib/assistente/ferramentas.server"),
      import("@/lib/assistente/guia"),
    ]);

    const [{ data: perfil }, { data: papeis }, { data: times }] = await Promise.all([
      db.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db.from("user_teams").select("team").eq("user_id", context.userId),
    ]);
    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const sistema = `Você é o assistente do Grou Compass, o CRM da Grou (comercial/SDR, Customer Success e administrativo).
Hoje é ${hoje}. Quem pergunta: ${(perfil as { full_name?: string } | null)?.full_name ?? "usuário"} · papéis: ${((papeis ?? []) as Array<{ role: string }>).map((p) => p.role).join(", ") || "—"} · times: ${((times ?? []) as Array<{ team: string }>).map((t) => t.team).join(", ") || "—"}.
Tela aberta agora: ${data.tela ?? "desconhecida"}.

Você faz duas coisas:
1. Responde perguntas sobre os DADOS do CRM usando as ferramentas. Nunca invente números, nomes ou datas: consulte antes. Se a ferramenta não cobre a pergunta, diga o que dá para ver e em qual tela.
2. Ensina a USAR o Compass com base no GUIA abaixo. Se a pessoa perguntar "como faço…" ou "o que é esta tela", responda pelo guia, citando o nome dos botões. Use a tela aberta como contexto. Se o guia não cobre, diga que não sabe em vez de inventar.

Regras de resposta:
- Português do Brasil, direto e curto. Markdown leve: listas, **negrito** nos números importantes.
- Sempre que citar um lead, empresa, negócio ou tela, ponha o link interno em markdown, ex.: [Acme](/empresas/AB12) ou [Pipeline](/kanban). Use só links que vieram das ferramentas ou rotas do guia.
- Valores em reais no formato brasileiro. Datas dd/mm/aaaa.
- Os dados respeitam o acesso de quem pergunta: se algo vier vazio, pode ser falta de acesso; diga isso.
- Período padrão quando a pessoa não disser: últimos 30 dias (e diga que usou esse período).

ferramentas: buscar_registros, consultar_negocios, consultar_carteira_cs, detalhar_empresa, detalhar_lead, consultar_propostas, e para análise de leads/campanhas: get_analytics, query_leads, compare_dimensions, list_stages.

# GUIA DO COMPASS
${guiaComoTexto()}`;

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
    const ferramentas = [...FERRAMENTAS_CRM, ...TOOLS];
    const nomesCrm = new Set(FERRAMENTAS_CRM.map((f) => f.function.name));
    const usadas: string[] = [];

    for (let rodada = 0; rodada < 6; rodada++) {
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
          resultado = nomesCrm.has(c.function.name)
            ? await executarFerramentaCrm(db, c.function.name, args)
            : await execTool(db, c.function.name, args);
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
