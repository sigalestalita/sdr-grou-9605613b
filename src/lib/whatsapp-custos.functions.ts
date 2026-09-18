import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CATEGORIAS,
  type Categoria,
  type ModeloDeCobranca,
  type VolumeDoMes,
  zeradoPorCategoria,
} from "./whatsapp/custos";

export const PRECOS_KEY = "whatsapp_precos";

/*
 * A tabela nasce vazia de propósito.
 *
 * Preço da Meta muda por país, por categoria e por acordo — chutar um número
 * aqui daria um painel bonito e errado. Sem preço preenchido, a tela mostra o
 * volume e avisa que falta configurar, em vez de apresentar zero como verdade.
 */
function modelosPadrao(): ModeloDeCobranca[] {
  return [
    {
      id: "atual",
      nome: "Cobrança atual",
      unidade: "mensagem",
      vigenteDe: null,
      precos: zeradoPorCategoria(),
      nota: "Copie os valores do painel de cobrança da Meta (WhatsApp Manager > Insights > Cobrança).",
    },
    {
      id: "novo",
      nome: "A partir de 01/10/2026",
      unidade: "mensagem",
      vigenteDe: "2026-10-01",
      precos: zeradoPorCategoria(),
      nota: "Tabela nova anunciada pela Meta. Preencha quando os valores estiverem publicados para o Brasil.",
    },
  ];
}

const categoriaSchema = z.object({
  marketing: z.number().min(0),
  utility: z.number().min(0),
  authentication: z.number().min(0),
  service: z.number().min(0),
});

const modeloSchema = z.object({
  id: z.string().min(1).max(40),
  nome: z.string().min(1).max(80),
  unidade: z.enum(["conversa", "mensagem"]),
  vigenteDe: z.string().nullable(),
  precos: categoriaSchema,
  nota: z.string().max(400).optional(),
});

function parseModelos(value: unknown): ModeloDeCobranca[] {
  const r = z.object({ modelos: z.array(modeloSchema).min(1).max(6) }).safeParse(value);
  if (!r.success) return modelosPadrao();
  return r.data.modelos;
}

export const lerPrecosWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("value")
      .eq("key", PRECOS_KEY)
      .maybeSingle();
    return { modelos: parseModelos(data?.value) };
  });

export const salvarPrecosWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ modelos: z.array(modeloSchema).min(1).max(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores alteram a tabela de preços.");
    await supabase
      .from("app_settings")
      .upsert({ key: PRECOS_KEY, value: { modelos: data.modelos } as never } as never, {
        onConflict: "key",
      });
    return { ok: true };
  });

type MensagemLite = {
  id: string;
  conversation_id: string;
  message_type: string;
  sender_type: string;
  created_at: string;
  metadata: { template_id?: string | null } | null;
};

function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Volume de mensageria por mês.
 *
 * Só conta o que a Meta cobra de fato: template enviado. Mensagem recebida e
 * resposta livre dentro da janela aparecem para explicar o movimento, não para
 * entrar na conta.
 */
export const resumoDeCustosWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ meses: z.number().int().min(1).max(12).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const meses = data.meses ?? 6;
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - (meses - 1), 1);
    inicio.setHours(0, 0, 0, 0);
    const desde = inicio.toISOString();

    const PAGINA = 1000;
    const mensagens: MensagemLite[] = [];
    for (let de = 0; ; de += PAGINA) {
      const { data: linhas, error } = await supabase
        .from("whatsapp_messages")
        .select("id, conversation_id, message_type, sender_type, created_at, metadata")
        .gte("created_at", desde)
        .order("id", { ascending: true })
        .range(de, de + PAGINA - 1);
      if (error) throw new Error(error.message);
      const lote = (linhas ?? []) as unknown as MensagemLite[];
      mensagens.push(...lote);
      if (lote.length < PAGINA || mensagens.length >= 100_000) break;
    }

    const { data: templates } = await supabase
      .from("whatsapp_templates")
      .select("id, name, category");
    const categoriaDoTemplate = new Map<string, Categoria>();
    const nomeDoTemplate = new Map<string, string>();
    for (const t of (templates ?? []) as Array<{
      id: string;
      name: string | null;
      category: string | null;
    }>) {
      const c = (t.category ?? "").toLowerCase();
      categoriaDoTemplate.set(
        t.id,
        (CATEGORIAS as readonly string[]).includes(c) ? (c as Categoria) : "utility",
      );
      nomeDoTemplate.set(t.id, t.name ?? "(sem nome)");
    }

    const porMes = new Map<
      string,
      VolumeDoMes & { conversasVistas: Record<Categoria, Set<string>> }
    >();
    const porTemplate = new Map<string, { nome: string; categoria: Categoria; enviados: number }>();

    const novoMes = (mes: string) => ({
      mes,
      enviadosPorCategoria: zeradoPorCategoria(),
      conversasPorCategoria: zeradoPorCategoria(),
      respostasLivres: 0,
      recebidas: 0,
      conversasVistas: {
        marketing: new Set<string>(),
        utility: new Set<string>(),
        authentication: new Set<string>(),
        service: new Set<string>(),
      },
    });

    for (const m of mensagens) {
      const mes = mesDe(m.created_at);
      const registro = porMes.get(mes) ?? novoMes(mes);
      porMes.set(mes, registro);

      if (m.sender_type === "lead") {
        registro.recebidas += 1;
        continue;
      }
      if (m.message_type !== "template") {
        registro.respostasLivres += 1;
        continue;
      }
      const templateId = m.metadata?.template_id ?? null;
      // Template sem id no metadata ainda é template enviado: entra como
      // utilidade, que é a categoria mais barata, para não inflar a conta.
      const categoria = (templateId && categoriaDoTemplate.get(templateId)) || "utility";
      registro.enviadosPorCategoria[categoria] += 1;
      registro.conversasVistas[categoria].add(m.conversation_id);
      if (templateId) {
        const t = porTemplate.get(templateId) ?? {
          nome: nomeDoTemplate.get(templateId) ?? "(template removido)",
          categoria,
          enviados: 0,
        };
        t.enviados += 1;
        porTemplate.set(templateId, t);
      }
    }

    const volumes: VolumeDoMes[] = [...porMes.values()]
      .map((r) => ({
        mes: r.mes,
        enviadosPorCategoria: r.enviadosPorCategoria,
        conversasPorCategoria: CATEGORIAS.reduce(
          (acc, c) => ({ ...acc, [c]: r.conversasVistas[c].size }),
          zeradoPorCategoria(),
        ),
        respostasLivres: r.respostasLivres,
        recebidas: r.recebidas,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    const { data: precos } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", PRECOS_KEY)
      .maybeSingle();

    return {
      volumes,
      modelos: parseModelos(precos?.value),
      porTemplate: [...porTemplate.entries()]
        .map(([id, t]) => ({ id, ...t }))
        .sort((a, b) => b.enviados - a.enviados)
        .slice(0, 20),
      mensagensLidas: mensagens.length,
      desde,
    };
  });
