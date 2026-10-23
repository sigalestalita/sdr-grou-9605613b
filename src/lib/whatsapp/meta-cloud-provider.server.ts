// Provedor oficial Meta WhatsApp Cloud API.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Por conta (whatsapp_accounts):
//   provider               = "meta_cloud"
//   provider_instance_id   = Phone Number ID (do WhatsApp Manager)
//   access_token           = System User Access Token permanente
//   webhook_secret         = App Secret (assinatura X-Hub-Signature-256)
//   metadata.verify_token  = Verify Token configurado no callback do webhook
//   metadata.waba_id       = (opcional) WhatsApp Business Account ID
//   provider_base_url      = (opcional) override do endpoint Graph, default v21.0
import * as nodeCrypto from "node:crypto";
import type {
  WhatsAppProvider,
  WaSendInput,
  WaSendResult,
  WaWebhookEvent,
  WaInboundMessage,
  WaStatusUpdate,
  WaMessageType,
} from "./provider-types";

const DEFAULT_BASE = "https://graph.facebook.com/v21.0";

function normalizePhone(p: string) {
  const digits = p.replace(/\D+/g, "").replace(/^0+/, "");
  // Leads brasileiros geralmente chegam da planilha como DDD+número (ex: 51999969371).
  // A Meta exige E.164 sem "+"; para números BR locais, adicionamos o DDI 55.
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

function buildPayload(input: WaSendInput): Record<string, unknown> {
  const to = normalizePhone(input.to);
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (input.type) {
    case "text":
      return { ...base, type: "text", text: { preview_url: false, body: input.body ?? "" } };
    case "image":
      return { ...base, type: "image", image: { link: input.mediaUrl, caption: input.body } };
    case "video":
      return { ...base, type: "video", video: { link: input.mediaUrl, caption: input.body } };
    case "audio":
      return { ...base, type: "audio", audio: { link: input.mediaUrl } };
    case "file":
      return { ...base, type: "document", document: { link: input.mediaUrl, caption: input.body } };
    case "template": {
      const components: Array<Record<string, unknown>> = [];
      const header = input.templateHeaderParams?.map((v) => String(v ?? "")) ?? [];
      const positional: string[] =
        input.templateParams && input.templateParams.length > 0
          ? input.templateParams.map((v) => String(v ?? ""))
          : Object.keys(input.templateVariables ?? {})
              .sort()
              .map((k) => String((input.templateVariables ?? {})[k] ?? ""));
      /*
       * Cabeçalho de mídia vem antes do de texto: um template tem um cabeçalho
       * só, e se ele é imagem, a Meta espera o parâmetro de imagem. Mandar
       * texto ali, ou não mandar nada, dá #132012.
       */
      const midia = input.templateHeaderMedia;
      if (midia && (midia.link || midia.id)) {
        const chave = midia.format.toLowerCase() as "image" | "video" | "document";
        const valor: Record<string, unknown> = midia.id ? { id: midia.id } : { link: midia.link };
        if (chave === "document" && midia.filename) valor.filename = midia.filename;
        components.push({
          type: "header",
          parameters: [{ type: chave, [chave]: valor }],
        });
      } else if (header.length > 0) {
        components.push({
          type: "header",
          parameters: header.map((text) => ({ type: "text", text: text || " " })),
        });
      }
      if (positional.length > 0) {
        components.push({
          type: "body",
          parameters: positional.map((text) => ({ type: "text", text: text || " " })),
        });
      }
      return {
        ...base,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.templateLanguage || "pt_BR" },
          ...(components.length ? { components } : {}),
        },
      };
    }
  }
}

type MensagemMeta = {
  id: string;
  from?: string;
  to?: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string; url?: string };
  video?: { id?: string; mime_type?: string; caption?: string; url?: string };
  audio?: { id?: string; mime_type?: string; url?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string; url?: string };
  history_context?: { status?: string };
};

/** Tipo, texto e mídia de uma mensagem — igual para recebida, eco e histórico. */
function lerConteudo(m: MensagemMeta): {
  type: WaMessageType;
  body?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaMime?: string;
} {
  switch (m.type) {
    case "text":
      return { type: "text", body: m.text?.body };
    case "image":
      return {
        type: "image",
        body: m.image?.caption,
        mediaId: m.image?.id,
        mediaUrl: m.image?.url,
        mediaMime: m.image?.mime_type,
      };
    case "video":
      return {
        type: "video",
        body: m.video?.caption,
        mediaId: m.video?.id,
        mediaUrl: m.video?.url,
        mediaMime: m.video?.mime_type,
      };
    case "audio":
      return {
        type: "audio",
        mediaId: m.audio?.id,
        mediaUrl: m.audio?.url,
        mediaMime: m.audio?.mime_type,
      };
    case "document":
      return {
        type: "file",
        body: m.document?.caption ?? m.document?.filename,
        mediaId: m.document?.id,
        mediaUrl: m.document?.url,
        mediaMime: m.document?.mime_type,
      };
    default:
      return { type: "text", body: `[${m.type} não suportado]` };
  }
}

type ValorCoexistencia = {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  message_echoes?: MensagemMeta[];
  history?: Array<{
    threads?: Array<{ id?: string; messages?: MensagemMeta[] }>;
  }>;
  state_sync?: Array<{
    type?: string;
    action?: string;
    contact?: { full_name?: string; first_name?: string; phone_number?: string };
  }>;
};

const soDigitos = (v?: string) => (v ?? "").replace(/\D+/g, "");

/**
 * Os três campos que a coexistência traz no mesmo webhook.
 *
 *   smb_message_echoes  — o que a SDR digitou no app do celular. Sem isto o
 *                         card do lead mostra só metade da conversa, e a IA
 *                         e os FUPs acham que ninguém respondeu.
 *   history             — as conversas que já estavam no celular, entregues em
 *                         lotes logo depois da conexão (até 6 meses).
 *   smb_app_state_sync  — a agenda de contatos do app, com o nome salvo.
 *
 * O formato foi conferido nos eventos reais guardados em
 * whatsapp_webhook_events, não só na documentação.
 */
export function lerCoexistencia(campo: string, value: ValorCoexistencia): WaWebhookEvent[] {
  const numeroDaEmpresa = soDigitos(value.metadata?.display_phone_number);
  const toPhoneNumberId = value.metadata?.phone_number_id;
  const events: WaWebhookEvent[] = [];

  if (campo === "smb_message_echoes") {
    for (const m of value.message_echoes ?? []) {
      const contato = soDigitos(m.to);
      if (!m.id || !contato) continue;
      events.push({
        kind: "mirror",
        data: {
          providerMessageId: m.id,
          from: soDigitos(m.from) || numeroDaEmpresa,
          to: contato,
          ...lerConteudo(m),
          timestamp: Number(m.timestamp) * 1000,
          toPhoneNumberId,
          contactPhone: contato,
          fromBusiness: true,
          origem: "echo",
        },
      });
    }
  }

  if (campo === "history") {
    for (const lote of value.history ?? []) {
      for (const thread of lote.threads ?? []) {
        for (const m of thread.messages ?? []) {
          const de = soDigitos(m.from);
          // Quem não é a empresa é o contato; sem "from", vale o id da thread.
          const fromBusiness = !!de && de === numeroDaEmpresa;
          const contato = fromBusiness
            ? soDigitos(m.to) || soDigitos(thread.id)
            : de || soDigitos(thread.id);
          if (!m.id || !contato) continue;
          events.push({
            kind: "mirror",
            data: {
              providerMessageId: m.id,
              from: de || contato,
              to: fromBusiness ? contato : numeroDaEmpresa,
              ...lerConteudo(m),
              timestamp: Number(m.timestamp) * 1000,
              toPhoneNumberId,
              contactPhone: contato,
              fromBusiness,
              origem: "history",
              historyStatus: m.history_context?.status,
            },
          });
        }
      }
    }
  }

  if (campo === "smb_app_state_sync") {
    for (const item of value.state_sync ?? []) {
      if (item.type !== "contact") continue;
      const phone = soDigitos(item.contact?.phone_number);
      if (!phone) continue;
      events.push({
        kind: "contact_sync",
        data: {
          phone,
          name: item.contact?.full_name || item.contact?.first_name,
          action: item.action ?? "add",
          toPhoneNumberId,
        },
      });
    }
  }

  return events;
}

export const metaCloudProvider: WhatsAppProvider = {
  id: "meta_cloud",

  async sendMessage(input: WaSendInput): Promise<WaSendResult> {
    const { account } = input;
    if (!account.access_token) {
      return { providerMessageId: "", status: "failed", error: "access_token ausente na conta" };
    }
    if (!account.provider_instance_id) {
      return {
        providerMessageId: "",
        status: "failed",
        error: "phone_number_id (provider_instance_id) ausente",
      };
    }
    const base = (account.provider_base_url || DEFAULT_BASE).replace(/\/+$/, "");
    const url = `${base}/${account.provider_instance_id}/messages`;
    const payload = buildPayload(input);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let json: { messages?: Array<{ id: string }>; error?: { message?: string } } = {};
      try {
        json = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const errMsg = json?.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`;
        return { providerMessageId: "", status: "failed", error: errMsg };
      }
      const id = json.messages?.[0]?.id ?? "";
      return { providerMessageId: id, status: "sending" };
    } catch (e) {
      return {
        providerMessageId: "",
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  verifySignature(rawBody, headers, secret): boolean {
    const sigHeader = headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"];
    const appSecret = secret?.trim();
    if (!sigHeader || !appSecret) return false;
    const provided = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
    const expected = nodeCrypto
      .createHmac("sha256", appSecret)
      .update(rawBody, "utf8")
      .digest("hex");
    try {
      const a = Buffer.from(provided, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  },

  parseWebhook(rawBody): WaWebhookEvent[] {
    let payload: {
      entry?: Array<{
        changes?: Array<{
          field?: string;
          value?: {
            metadata?: { display_phone_number?: string; phone_number_id?: string };
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              type: string;
              text?: { body?: string };
              image?: { id?: string; mime_type?: string; caption?: string; url?: string };
              video?: { id?: string; mime_type?: string; caption?: string; url?: string };
              audio?: { id?: string; mime_type?: string; url?: string };
              document?: {
                id?: string;
                mime_type?: string;
                filename?: string;
                caption?: string;
                url?: string;
              };
            }>;
            statuses?: Array<{
              id: string;
              status: string;
              timestamp: string;
              errors?: Array<{ title?: string; message?: string }>;
            }>;
          };
        }>;
      }>;
    } = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return [];
    }

    const events: WaWebhookEvent[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        /*
         * Campo que não é "messages": guarda para diagnóstico.
         *
         * É por aqui que a coexistência vai aparecer — eco das mensagens que o
         * SDR digita no próprio celular, histórico das conversas antigas,
         * sincronização de contatos. Os nomes exatos dos campos a Meta muda com
         * o tempo, então nada é adivinhado: o evento fica registrado com o nome
         * que veio e o corpo cru.
         */
        const campo = (change as { field?: string }).field ?? "";
        if (
          campo === "smb_message_echoes" ||
          campo === "history" ||
          campo === "smb_app_state_sync"
        ) {
          const lidos = lerCoexistencia(campo, value as ValorCoexistencia);
          // Formato que não reconhecemos continua indo para o diagnóstico.
          events.push(
            ...(lidos.length ? lidos : [{ kind: "unknown" as const, field: campo, value }]),
          );
          continue;
        }
        if (campo && campo !== "messages") {
          events.push({ kind: "unknown", field: campo, value });
          continue;
        }
        const toNumber = value.metadata?.display_phone_number ?? "";
        // Todas as contas do app caem na mesma URL; é este id que diz de quem é.
        const toPhoneNumberId = value.metadata?.phone_number_id;
        const contactName = value.contacts?.[0]?.profile?.name;

        for (const m of value.messages ?? []) {
          const inbound: WaInboundMessage = {
            providerMessageId: m.id,
            from: m.from,
            to: toNumber,
            ...lerConteudo(m),
            timestamp: Number(m.timestamp) * 1000,
            toPhoneNumberId,
            senderName: contactName,
          };
          events.push({ kind: "message", data: inbound });
        }

        for (const s of value.statuses ?? []) {
          const mapped: WaStatusUpdate["status"] =
            s.status === "read"
              ? "read"
              : s.status === "delivered"
                ? "delivered"
                : s.status === "sent"
                  ? "sent"
                  : "failed";
          const errText = s.errors?.[0]?.message || s.errors?.[0]?.title;
          events.push({
            kind: "status",
            data: {
              providerMessageId: s.id,
              status: mapped,
              error: errText,
              timestamp: Number(s.timestamp) * 1000,
            },
          });
        }
      }
    }
    return events;
  },
};
