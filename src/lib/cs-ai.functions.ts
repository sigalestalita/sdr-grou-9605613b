import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * A IA do Customer Success.
 *
 * Separada da IA do SDR de propósito. As duas conversam por WhatsApp, mas não
 * fazem a mesma coisa: a do SDR qualifica e vende, a do CS resolve. Fossem a
 * mesma configuração, uma herdaria as ofertas e o objetivo da outra — e a IA do
 * CS oferecendo desconto a um cliente é exatamente o que não pode acontecer.
 *
 * O que ela sabe vem do playbook do CS, que o time já mantém. Fora dele, a
 * resposta é abrir ticket — melhor devolver "vou acionar quem resolve" do que
 * inventar procedimento.
 */

const MODEL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ConfigIaCs = {
  enabled: boolean;
  autoReplyEnabled: boolean;
  objetivo: string;
  tom: string;
  limites: string;
  abrirTicketQuando: string;
  assinaturaFallback: string;
};

const PADRAO: ConfigIaCs = {
  enabled: false,
  autoReplyEnabled: false,
  objetivo:
    "Atender o cliente no WhatsApp: entender o pedido, resolver o que o playbook cobre e abrir ticket para o que precisa de gente.",
  tom: "Tom de analista de CS: próximo, direto e resolutivo. Sem formalidade excessiva e sem prometer prazo que não depende de você.",
  limites:
    "Nunca falar de preço, desconto, renovação, upgrade ou condição comercial: isso é do executivo de carteira. Nunca prometer prazo de entrega, correção ou desenvolvimento. Não inventar funcionalidade que não está no playbook.",
  abrirTicketQuando:
    "Abra ticket quando o pedido exigir alguém do time: erro no sistema, dado errado, pedido de configuração, dúvida que o playbook não responde, ou qualquer insatisfação.",
  assinaturaFallback: "Equipe Grou",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lerConfigIaCs(supabase: any): Promise<ConfigIaCs> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "cs_ai_agent")
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<ConfigIaCs>;
  return { ...PADRAO, ...v };
}

/**
 * O que a IA do CS sabe.
 *
 * Os blocos ativos do playbook, na ordem que o time definiu. É o mesmo material
 * que o analista consulta — assim a resposta automática e a humana contam a
 * mesma história, e manter o playbook passa a valer para as duas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function playbookDoCs(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("cs_playbook_blocks")
    .select("tipo, titulo, corpo, cor")
    .eq("ativo", true)
    .order("ordem");
  const blocos = (data ?? []) as Array<{
    tipo: string;
    titulo: string;
    corpo: string;
    cor: string;
  }>;
  if (blocos.length === 0) return "";
  return blocos
    .map(
      (b) =>
        `[${b.tipo}${b.cor && b.cor !== "geral" ? ` · ${b.cor}` : ""}] ${b.titulo}\n${b.corpo}`,
    )
    .join("\n\n");
}

function montarPrompt(cfg: ConfigIaCs, playbook: string, assinatura: string, empresa: string) {
  return [
    "Você faz o atendimento de suporte da Grou no WhatsApp, para clientes que já usam os produtos.",
    `Você se apresenta e assina como ${assinatura}. Nunca se apresente como inteligência artificial e nunca use o nome de outra pessoa do time.`,
    `Você está falando com alguém de ${empresa}, que é cliente.`,
    `Objetivo: ${cfg.objetivo}`,
    `Tom: ${cfg.tom}`,
    `Limites obrigatórios: ${cfg.limites}`,
    /*
     * A separação entre CS e comercial é a regra que mais importa aqui. Cliente
     * perguntando preço de upgrade parece pergunta de suporte, mas quem
     * responde é o executivo de carteira — e a IA improvisando um valor cria
     * expectativa que alguém vai ter que desfazer.
     */
    "Assunto comercial não é seu: renovação, upgrade, recompra, preço e desconto vão para o executivo de carteira. Reconheça o pedido, diga que vai acionar a pessoa certa e abra ticket.",
    "Cumprimente uma vez só. Se já houve saudação antes na conversa, vá direto ao ponto.",
    "Uma ideia por mensagem, no máximo duas frases curtas.",
    playbook
      ? `Playbook do CS — é daqui que saem as suas respostas:\n${playbook}`
      : "Não há playbook configurado. Sem material, não invente procedimento: reconheça o pedido e abra ticket.",
    `Quando abrir ticket: ${cfg.abrirTicketQuando}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function chamarIa(mensagens: Array<{ role: string; content: string }>, tool?: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const body: Record<string, unknown> = { model: MODEL, messages: mensagens };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = "auto";
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{ function: { name: string; arguments: string } }>;
      };
    }>;
  }>;
}

const FERRAMENTA_TICKET = {
  type: "function",
  function: {
    name: "abrir_ticket",
    description:
      "Abre um ticket para o time do CS quando o pedido do cliente precisa de alguém, ou quando é assunto comercial.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Resumo do pedido em uma linha." },
        descricao: { type: "string", description: "O que o cliente pediu, nas palavras dele." },
        prioridade: { type: "string", enum: ["baixa", "normal", "alta", "urgente"] },
      },
      required: ["titulo", "descricao", "prioridade"],
      additionalProperties: false,
    },
  },
};

/**
 * Responde uma conversa do CS, e abre ticket quando precisa.
 *
 * Devolve a resposta em texto e o número do ticket, se algum foi aberto — a
 * conversa continua sendo o canal, o ticket é o que dá estado ao pedido.
 */
export async function responderComoCs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  conversationId: string,
): Promise<{ resposta: string; ticket: number | null } | null> {
  const cfg = await lerConfigIaCs(admin);
  if (!cfg.enabled || !cfg.autoReplyEnabled) return null;

  const { data: conv } = await admin
    .from("whatsapp_conversations")
    .select("id, client_uid, area, assigned_user_id")
    .eq("id", conversationId)
    .maybeSingle();
  const c = conv as {
    id: string;
    client_uid: string | null;
    area: string | null;
    assigned_user_id: string | null;
  } | null;
  if (!c?.client_uid || c.area !== "cs") return null;

  const { data: cliente } = await admin
    .from("cs_clients")
    .select("nome_empresa, cs_responsavel_id")
    .eq("client_uid", c.client_uid)
    .maybeSingle();
  const empresa = (cliente as { nome_empresa?: string } | null)?.nome_empresa ?? "sua empresa";

  // Assina com quem cuida da conta, como a IA do SDR assina com o responsável.
  const dono =
    (cliente as { cs_responsavel_id?: string | null } | null)?.cs_responsavel_id ??
    c.assigned_user_id;
  let assinatura = cfg.assinaturaFallback;
  if (dono) {
    const { data: perfil } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", dono)
      .maybeSingle();
    const nome = (perfil as { full_name?: string; email?: string } | null)?.full_name;
    if (nome) assinatura = nome.split(/\s+/)[0];
  }

  const { data: msgs } = await admin
    .from("whatsapp_messages")
    .select("sender_type, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);
  const mensagens = (msgs ?? []) as Array<{ sender_type: string; body: string | null }>;
  const ultima = [...mensagens].reverse().find((m) => m.sender_type === "lead" && m.body?.trim());
  if (!ultima) return null;

  const playbook = await playbookDoCs(admin);
  const transcricao = mensagens
    .map((m) => `${m.sender_type === "lead" ? "Cliente" : assinatura}: ${m.body ?? ""}`)
    .join("\n");

  const r = await chamarIa(
    [
      { role: "system", content: montarPrompt(cfg, playbook, assinatura, empresa) },
      {
        role: "user",
        content: `Conversa:\n${transcricao}\n\nÚltima mensagem do cliente: ${ultima.body}\n\nResponda como mensagem de WhatsApp pronta, curta e direta.`,
      },
    ],
    FERRAMENTA_TICKET,
  );

  const msg = r.choices?.[0]?.message;
  let ticket: number | null = null;

  const chamada = msg?.tool_calls?.find((t) => t.function.name === "abrir_ticket");
  if (chamada) {
    try {
      const args = JSON.parse(chamada.function.arguments) as {
        titulo?: string;
        descricao?: string;
        prioridade?: "baixa" | "normal" | "alta" | "urgente";
      };
      const { abrirTicketPelaIa } = await import("./cs-tickets.functions");
      const criado = await abrirTicketPelaIa({
        clientUid: c.client_uid,
        conversationId,
        titulo: args.titulo ?? "Pedido do cliente pelo WhatsApp",
        descricao: args.descricao ?? ultima.body ?? null,
        prioridade: args.prioridade ?? "normal",
      });
      ticket = criado?.numero ?? null;
    } catch {
      ticket = null;
    }
  }

  const resposta = (msg?.content ?? "").trim();
  if (!resposta) return null;

  const { removerSaudacaoRepetida } = await import("./whatsapp/saudacao");
  const jaFalamosAntes = mensagens.some((m) =>
    ["bot", "automation", "sdr", "agent", "human"].includes(m.sender_type),
  );
  return { resposta: removerSaudacaoRepetida(resposta, jaFalamosAntes), ticket };
}

export const getConfigIaCs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cfg = await lerConfigIaCs(context.supabase);
    const playbook = await playbookDoCs(context.supabase);
    return { cfg, blocosNoPlaybook: playbook ? playbook.split("\n\n").length : 0 };
  });

export const salvarConfigIaCs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enabled: z.boolean(),
        autoReplyEnabled: z.boolean(),
        objetivo: z.string().max(2000),
        tom: z.string().max(2000),
        limites: z.string().max(2000),
        abrirTicketQuando: z.string().max(2000),
        assinaturaFallback: z.string().max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores configuram a IA do CS.");
    const { error } = await supabase.from("app_settings").upsert({
      key: "cs_ai_agent",
      value: data,
      updated_at: new Date().toISOString(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
