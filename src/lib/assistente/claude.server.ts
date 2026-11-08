import Anthropic from "@anthropic-ai/sdk";

/*
 * Conversa com o Claude (API da Anthropic) com ferramentas do Compass.
 * - Modelo Claude Opus 5.5, esforço "medium".
 * - O prompt fixo (regras + guia das telas) vai em cache: perguntas seguidas
 *   pagam só a parte nova. O que muda a cada pergunta (quem, data, tela) vem
 *   depois do ponto de cache.
 * - Recusas de segurança são reencaminhadas pelo próprio servidor
 *   (fallbacks "default").
 * A chave fica no secret ANTHROPIC_API_KEY do Lovable.
 */
export const MODELO_CLAUDE = "claude-opus-5-5";

export function temClaude() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Ferramenta no formato que o Compass já usa (estilo OpenAI). */
export type FerramentaCompass = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export async function conversarComClaude(opts: {
  sistemaFixo: string;
  sistemaVariavel: string;
  mensagens: Array<{ role: "user" | "assistant"; content: string }>;
  ferramentas: FerramentaCompass[];
  executar: (nome: string, args: Record<string, unknown>) => Promise<unknown>;
  maxRodadas?: number;
}): Promise<{ resposta: string; ferramentas: string[] }> {
  const client = new Anthropic();
  const tools: Anthropic.Beta.BetaTool[] = opts.ferramentas.map((f) => ({
    name: f.function.name,
    description: f.function.description,
    input_schema: {
      type: "object",
      ...f.function.parameters,
    } as Anthropic.Beta.BetaTool.InputSchema,
  }));
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.mensagens.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const usadas: string[] = [];

  for (let rodada = 0; rodada < (opts.maxRodadas ?? 8); rodada++) {
    const r = await client.beta.messages.create({
      model: MODELO_CLAUDE,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: opts.sistemaFixo, cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.sistemaVariavel },
      ],
      tools,
      messages,
    });

    if (r.stop_reason === "refusal")
      return {
        resposta: "Não posso responder a essa pergunta. Tente reformular.",
        ferramentas: usadas,
      };

    const chamadas = r.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (r.stop_reason !== "tool_use" || !chamadas.length) {
      const texto = r.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return {
        resposta:
          texto ||
          (r.stop_reason === "max_tokens"
            ? "A resposta ficou longa demais. Peça algo mais específico."
            : ""),
        ferramentas: usadas,
      };
    }

    // A conversa só cresce: o conteúdo inteiro da resposta volta como veio.
    messages.push({ role: "assistant", content: r.content });
    const resultados = await Promise.all(
      chamadas.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        usadas.push(c.name);
        try {
          const out = await opts.executar(c.name, (c.input ?? {}) as Record<string, unknown>);
          return {
            type: "tool_result",
            tool_use_id: c.id,
            content: JSON.stringify(out).slice(0, 30000),
          };
        } catch (e) {
          return {
            type: "tool_result",
            tool_use_id: c.id,
            content: e instanceof Error ? e.message : String(e),
            is_error: true,
          };
        }
      }),
    );
    // Todos os resultados numa mensagem só.
    messages.push({ role: "user", content: resultados });
  }
  return {
    resposta: "Precisei de consultas demais para essa pergunta. Tente ser mais específico.",
    ferramentas: usadas,
  };
}
