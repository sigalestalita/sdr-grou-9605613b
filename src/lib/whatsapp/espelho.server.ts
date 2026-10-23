import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { WaContactSync, WaMirroredMessage } from "./provider-types";

/*
 * O que acontece no celular da SDR aparece no Compass.
 *
 * Com a coexistência o número continua no app WhatsApp Business do aparelho.
 * A Meta devolve para nós duas coisas que não passaram pela API: o eco de cada
 * mensagem que a SDR digita no celular e, logo depois da conexão, o histórico
 * das conversas que já estavam lá.
 *
 * Tudo aqui só registra. Não cria lead (contato que não é lead fica numa
 * conversa sem lead, como nos números espelhados), não acorda a IA e não
 * avisa ninguém — a SDR já está com o celular na mão.
 */

type Admin = SupabaseClient<Database>;

type Conta = {
  id: string;
  owner_user_id?: string | null;
  access_token: string | null;
  provider_base_url: string | null;
};

const STATUS_DO_HISTORICO: Record<string, string> = {
  READ: "read",
  PLAYED: "read",
  DELIVERED: "delivered",
  SENT: "sent",
  ERROR: "failed",
};

/** Status gravado na mensagem espelhada. */
export function statusDoEspelho(m: Pick<WaMirroredMessage, "fromBusiness" | "historyStatus">) {
  if (!m.fromBusiness) return "delivered";
  return STATUS_DO_HISTORICO[(m.historyStatus ?? "").toUpperCase()] ?? "sent";
}

/** Agrupa por contato, para resolver contato, lead e conversa uma vez só. */
export function agruparPorContato(msgs: WaMirroredMessage[]) {
  const grupos = new Map<string, WaMirroredMessage[]>();
  for (const m of msgs) {
    const lista = grupos.get(m.contactPhone) ?? [];
    lista.push(m);
    grupos.set(m.contactPhone, lista);
  }
  for (const lista of grupos.values()) lista.sort((a, b) => a.timestamp - b.timestamp);
  return grupos;
}

export async function registrarEspelhos(admin: Admin, conta: Conta, msgs: WaMirroredMessage[]) {
  for (const [telefone, doContato] of agruparPorContato(msgs)) {
    try {
      await registrarDoContato(admin, conta, telefone, doContato);
    } catch (e) {
      // Um contato com problema não pode derrubar o lote inteiro do histórico.
      console.error("[wa espelho] falha ao registrar conversa de", telefone.slice(-4), e);
    }
  }
}

async function registrarDoContato(
  admin: Admin,
  conta: Conta,
  telefone: string,
  msgs: WaMirroredMessage[],
) {
  // A Meta reentrega webhook; o que já entrou fica de fora.
  // Em blocos: uma conversa longa do histórico estouraria o tamanho da URL.
  const ids = msgs.map((m) => m.providerMessageId);
  const vistos = new Set<string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: jaEntraram } = await admin
      .from("whatsapp_messages")
      .select("provider_message_id")
      .in("provider_message_id", ids.slice(i, i + 100));
    for (const r of jaEntraram ?? []) vistos.add(r.provider_message_id);
  }
  const novas = msgs.filter((m) => !vistos.has(m.providerMessageId));
  if (!novas.length) return;

  const { acharLeadPorTelefone, acharContatoPorTelefone } = await import("./lead-match.server");
  let contato = await acharContatoPorTelefone(admin, telefone);
  let leadId = (contato?.lead_id as string | null) ?? null;
  if (!leadId) leadId = (await acharLeadPorTelefone(admin, telefone, "id"))?.id ?? null;

  if (!contato) {
    const ins = await admin
      .from("whatsapp_contacts")
      .insert({ phone: telefone, name: null, lead_id: leadId })
      .select("*")
      .single();
    contato = ins.data;
  }

  const soHistorico = novas.every((m) => m.origem === "history");
  let conversa = leadId
    ? (await admin.from("whatsapp_conversations").select("*").eq("lead_id", leadId).maybeSingle())
        .data
    : contato
      ? (
          await admin
            .from("whatsapp_conversations")
            .select("*")
            .is("lead_id", null)
            .eq("account_id", conta.id)
            .eq("contact_id", contato.id)
            .maybeSingle()
        ).data
      : null;

  if (!conversa) {
    const { data: lead } = leadId
      ? await admin.from("leads").select("assigned_to").eq("id", leadId).maybeSingle()
      : { data: null };
    const ins = await admin
      .from("whatsapp_conversations")
      .insert({
        lead_id: leadId,
        contact_id: contato?.id ?? null,
        account_id: conta.id,
        assigned_user_id: lead?.assigned_to ?? conta.owner_user_id ?? null,
        /*
         * Conversa que só existe no histórico nasce encerrada: são meses de
         * conversas antigas, e abertas elas enterrariam a fila do dia. Quando
         * o contato escrever de novo, ela reabre sozinha.
         */
        status: soHistorico ? "closed" : "open",
        // as never: lead_id nulo entra pela migration das conversas espelhadas.
      } as never)
      .select("*")
      .single();
    conversa = ins.data;
  }
  if (!conversa) return;

  const linhas = [];
  for (const m of novas) {
    const ts = new Date(m.timestamp).toISOString();
    /*
     * Mídia do eco vem para o storage como a do lead. A do histórico não:
     * seriam meses de áudio e foto baixados de uma vez, e o link da Meta já
     * expirou para a maioria. Fica o id, e o balão mostra o tipo.
     */
    let mediaUrl: string | null = null;
    let mediaMime: string | null = m.mediaMime ?? null;
    let metadata: Json = { origem: m.origem === "echo" ? "celular" : "historico" };
    if (m.origem === "echo" && (m.mediaId || m.mediaUrl)) {
      const { baixarMidia } = await import("./baixar-midia.server");
      const midia = await baixarMidia(admin, conta, {
        accountId: conta.id,
        phone: telefone,
        providerMessageId: m.providerMessageId,
        type: m.type,
        mediaId: m.mediaId,
        mediaUrl: m.mediaUrl,
        mediaMime: m.mediaMime,
      });
      mediaUrl = midia.mediaUrl;
      mediaMime = midia.mediaMime;
      metadata = { ...(midia.metadata as Record<string, Json>), ...(metadata as object) };
    } else if (m.mediaId) {
      metadata = { ...(metadata as object), provider_media_id: m.mediaId };
    }

    const status = statusDoEspelho(m);
    linhas.push({
      conversation_id: conversa.id,
      lead_id: leadId,
      sender_type: m.fromBusiness ? "sdr" : "lead",
      sender_user_id: m.fromBusiness ? (conta.owner_user_id ?? null) : null,
      message_type: m.type,
      body: m.body ?? (m.type === "text" ? null : `[${m.type}]`),
      media_url: mediaUrl,
      media_mime: mediaMime,
      metadata,
      provider_message_id: m.providerMessageId,
      status,
      sent_at: ts,
      delivered_at: status === "sent" ? null : ts,
      read_at: status === "read" ? ts : null,
      // A ordem da conversa é por created_at: o histórico entra no seu lugar.
      created_at: ts,
    });
  }

  const { error } = await admin.from("whatsapp_messages").insert(linhas as never);
  if (error) {
    // Corrida entre duas entregas do mesmo lote: o índice único barra a segunda.
    if (error.code !== "23505") throw new Error(error.message);
    for (const linha of linhas) {
      await admin.from("whatsapp_messages").insert(linha as never);
    }
  }

  const ultima = novas[novas.length - 1];
  const ultimaEm = new Date(ultima.timestamp).toISOString();
  const patch: { last_message_at?: string; last_preview?: string; unread_count?: number } = {};
  if (!conversa.last_message_at || conversa.last_message_at < ultimaEm) {
    patch.last_message_at = ultimaEm;
    patch.last_preview = ultima.body?.slice(0, 200) ?? `[${ultima.type}]`;
  }
  // A SDR respondeu pelo celular: ela leu a conversa.
  if (novas.some((m) => m.origem === "echo")) patch.unread_count = 0;
  if (Object.keys(patch).length) {
    await admin.from("whatsapp_conversations").update(patch).eq("id", conversa.id);
  }
  if (contato && patch.last_message_at) {
    await admin
      .from("whatsapp_contacts")
      .update({ last_message_at: ultimaEm })
      .eq("id", contato.id);
  }
}

/**
 * Agenda do app: guarda o nome que a SDR salvou para o contato.
 *
 * Só preenche nome vazio — o nome que veio do formulário ou que alguém
 * corrigiu no Compass vale mais do que o apelido salvo no celular.
 */
export async function sincronizarContato(admin: Admin, c: WaContactSync) {
  if (c.action === "remove") return;
  const { acharContatoPorTelefone } = await import("./lead-match.server");
  const contato = await acharContatoPorTelefone(admin, c.phone);
  if (!contato) {
    await admin.from("whatsapp_contacts").insert({ phone: c.phone, name: c.name ?? null });
    return;
  }
  if (!contato.name && c.name) {
    await admin.from("whatsapp_contacts").update({ name: c.name }).eq("id", contato.id);
  }
}
