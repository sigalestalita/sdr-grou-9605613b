import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MAX_ROTA, podeVerLogsDeUso } from "@/lib/uso";
import { rotuloDaRota } from "@/lib/uso-telas";

/*
 * Logs de uso: o app grava a entrada, cada tela aberta e um sinal de "ativo"
 * a cada 5 minutos (uso_eventos, só service role). Quem está em
 * ACESSO_LOGS_USO lê o de todo mundo.
 */
const db = () => supabaseAdmin as unknown as SupabaseClient;

/** Gravação: nunca derruba a tela; erro só no log do servidor. */
export const registrarUso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sessao: z.string().uuid(),
        tipo: z.enum(["entrada", "pagina", "ativo"]),
        rota: z.string().max(MAX_ROTA).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await db()
      .from("uso_eventos")
      .insert({ user_id: context.userId, sessao: data.sessao, tipo: data.tipo, rota: data.rota });
    if (error) console.error("[uso]", error.message);
    return { ok: !error };
  });

async function exigirAcesso(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !podeVerLogsDeUso(data.user?.email)) throw new Error("Os logs de uso são restritos");
}

/** Só para mostrar ou esconder o item do menu; a leitura confere de novo. */
export const podeVerUso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await exigirAcesso(context.userId);
      return true;
    } catch {
      return false;
    }
  });

type Resumo = {
  user_id: string;
  sessoes: number;
  dias_ativos: number;
  paginas: number;
  minutos_ativos: number;
  primeiro: string;
  ultimo: string;
};

export const resumoDeUso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ de: z.string().datetime(), ate: z.string().datetime() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAcesso(context.userId);
    const [perfis, resumo, telas, ultimos] = await Promise.all([
      db().from("profiles").select("id, full_name, email"),
      db().rpc("uso_resumo", { p_de: data.de, p_ate: data.ate }),
      db().rpc("uso_telas", { p_de: data.de, p_ate: data.ate }),
      db().rpc("uso_ultimo_acesso"),
    ]);
    for (const r of [perfis, resumo, telas, ultimos]) if (r.error) throw new Error(r.error.message);

    const porUser = new Map(((resumo.data ?? []) as Resumo[]).map((r) => [r.user_id, r]));
    const ultimoDe = new Map(
      ((ultimos.data ?? []) as Array<{ user_id: string; ultimo: string }>).map((r) => [
        r.user_id,
        r.ultimo,
      ]),
    );
    // telas por pessoa, somando rotas que dão no mesmo nome
    const telasDe = new Map<string, Map<string, number>>();
    for (const t of (telas.data ?? []) as Array<{ user_id: string; rota: string; n: number }>) {
      const m = telasDe.get(t.user_id) ?? new Map<string, number>();
      const nome = rotuloDaRota(t.rota);
      m.set(nome, (m.get(nome) ?? 0) + Number(t.n));
      telasDe.set(t.user_id, m);
    }

    const perfisRows = (perfis.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>;
    const conhecidos = new Set(perfisRows.map((p) => p.id));
    // quem tem uso e já não tem perfil (usuário removido) continua na lista
    const ids = [...conhecidos, ...[...ultimoDe.keys()].filter((id) => !conhecidos.has(id))];
    const perfilDe = new Map(perfisRows.map((p) => [p.id, p]));

    const pessoas = ids.map((id) => {
      const r = porUser.get(id);
      const p = perfilDe.get(id);
      return {
        id,
        nome: p?.full_name || p?.email || "Usuário removido",
        email: p?.email ?? "",
        removido: !p,
        sessoes: Number(r?.sessoes ?? 0),
        diasAtivos: Number(r?.dias_ativos ?? 0),
        paginas: Number(r?.paginas ?? 0),
        minutosAtivos: Number(r?.minutos_ativos ?? 0),
        ultimoAcesso: ultimoDe.get(id) ?? null,
        telas: [...(telasDe.get(id) ?? new Map<string, number>())]
          .map(([nome, n]) => ({ nome, n }))
          .sort((a, b) => b.n - a.n),
      };
    });
    pessoas.sort(
      (a, b) =>
        b.minutosAtivos - a.minutosAtivos ||
        (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? "") ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
    return { pessoas };
  });

const PAGINA = 200;

/** Linha do tempo: entradas e telas abertas (o sinal de "ativo" fica de fora). */
export const eventosDeUso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        de: z.string().datetime(),
        ate: z.string().datetime(),
        userId: z.string().uuid().optional(),
        antesDe: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAcesso(context.userId);
    let q = db()
      .from("uso_eventos")
      .select("id, user_id, sessao, tipo, rota, created_at")
      .in("tipo", ["entrada", "pagina"])
      .gte("created_at", data.de)
      .lt("created_at", data.ate)
      .order("id", { ascending: false })
      .limit(PAGINA);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.antesDe) q = q.lt("id", data.antesDe);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const eventos = (
      (rows ?? []) as Array<{
        id: number;
        user_id: string;
        sessao: string;
        tipo: "entrada" | "pagina";
        rota: string | null;
        created_at: string;
      }>
    ).map((e) => ({ ...e, tela: rotuloDaRota(e.rota) }));
    return {
      eventos,
      proximo: eventos.length === PAGINA ? eventos[eventos.length - 1].id : null,
    };
  });
