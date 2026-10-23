import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { escolherContaDaDona } from "./conta-da-dona";

type Conta = Database["public"]["Tables"]["whatsapp_accounts"]["Row"];

/**
 * Número conectado da SDR dona do lead, ou null para seguir pela conta de
 * sempre. Regras em conta-da-dona.ts.
 */
export async function contaDaDona(
  admin: SupabaseClient<Database>,
  donaId: string | null | undefined,
): Promise<Conta | null> {
  if (!donaId) return null;
  const [{ data: daDona }, { data: padrao }] = await Promise.all([
    admin.from("whatsapp_accounts").select("*").eq("owner_user_id", donaId),
    admin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle(),
  ]);
  return escolherContaDaDona((daDona ?? []) as Conta[], donaId, padrao as Conta | null);
}

/**
 * A conversa passa a ser do número que acabou de mandar.
 *
 * É pela conta da conversa que sai a próxima mensagem digitada no Compass;
 * se ela ficasse no número antigo, o lead receberia a primeira mensagem de
 * um número e a seguinte de outro.
 */
export async function moverConversaParaConta(
  admin: SupabaseClient<Database>,
  conversaId: string,
  contaId: string,
) {
  await admin
    .from("whatsapp_conversations")
    .update({ account_id: contaId })
    .eq("id", conversaId)
    .neq("account_id", contaId);
}
