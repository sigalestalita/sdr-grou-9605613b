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
  const { data: daDona } = await admin
    .from("whatsapp_accounts")
    .select("*")
    .eq("owner_user_id", donaId);
  return escolherContaDaDona((daDona ?? []) as Conta[], donaId);
}

/**
 * De qual número sai a próxima mensagem para o lead.
 *
 * Conversa já começada continua no número em que começou: o lead fala com um
 * número só, mesmo que a dona mude no meio do caminho (redistribuição, dono
 * novo no RD) — a nova dona responde pelo Compass, pelo mesmo número. A
 * única troca é a passagem anunciada para consultoria, feita à parte.
 * Conversa nova sai do número da dona. Null: segue a conta de sempre.
 */
export async function contaParaOLead(
  admin: SupabaseClient<Database>,
  leadId: string,
  donaId: string | null | undefined,
): Promise<Conta | null> {
  const { data: conversa } = await admin
    .from("whatsapp_conversations")
    .select("account_id")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (conversa?.account_id) {
    const { data: daConversa } = await admin
      .from("whatsapp_accounts")
      .select("*")
      .eq("id", conversa.account_id)
      .maybeSingle();
    if (daConversa) return daConversa;
  }
  return contaDaDona(admin, donaId);
}
