import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Envio de notificação no nome de quem está logado, pela função
 * notificar_usuarios (que confere quem pode mandar cada tipo). Falha ao notificar nunca derruba a ação principal:
 * o registro já foi feito, o aviso é complemento.
 */
export type TipoNotificacao =
  | "mencao"
  | "ganho_para_faturar"
  | "pendencia_adm"
  | "pendencia_respondida"
  | "requerimento"
  | "trainer"
  | "licenca"
  | "comissao"
  | "contrato"
  | "turma";

export async function notificar(
  db: SupabaseClient,
  autorId: string,
  n: {
    para: Array<string | null | undefined>;
    tipo: TipoNotificacao;
    titulo: string;
    corpo?: string | null;
    link?: string | null;
    dealId?: string | null;
  },
): Promise<void> {
  const destinos = [...new Set(n.para.filter((u): u is string => !!u && u !== autorId))];
  if (destinos.length === 0) return;
  // Pela função do banco: ela confere se quem está logado pode mandar esse tipo.
  const { error } = await db.rpc("notificar_usuarios", {
    _users: destinos,
    _tipo: n.tipo,
    _titulo: n.titulo.slice(0, 200),
    _corpo: n.corpo ? n.corpo.slice(0, 2000) : null,
    _link: n.link ?? null,
    _deal_id: n.dealId ?? null,
  });
  if (error) console.error("[notificar]", error.message);
}

/** Avisa o time de faturamento (função no banco, porque lê os vínculos de todos). */
export async function notificarFaturamento(
  db: SupabaseClient,
  n: {
    tipo: TipoNotificacao;
    titulo: string;
    corpo?: string | null;
    link?: string | null;
    dealId?: string | null;
  },
): Promise<void> {
  const { error } = await db.rpc("notificar_faturamento", {
    _tipo: n.tipo,
    _titulo: n.titulo,
    _corpo: n.corpo ?? null,
    _link: n.link ?? null,
    _deal_id: n.dealId ?? null,
  });
  if (error) console.error("[notificarFaturamento]", error.message);
}
