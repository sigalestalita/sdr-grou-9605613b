import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

/*
 * Baixa a mídia de uma mensagem da Meta para o storage privado.
 *
 * O link da Meta expira em minutos e exige o token da conta, então o arquivo
 * vem para o bucket na hora em que o webhook chega. Serve para a mensagem do
 * lead e para o eco do que a SDR mandou pelo celular.
 */
export async function baixarMidia(
  admin: SupabaseClient<Database>,
  conta: { access_token: string | null; provider_base_url: string | null },
  msg: {
    accountId: string;
    phone: string;
    providerMessageId: string;
    type: string;
    mediaId?: string;
    mediaUrl?: string;
    mediaMime?: string;
  },
): Promise<{ mediaUrl: string | null; mediaMime: string | null; metadata: Json }> {
  let mediaUrl = msg.mediaUrl ?? null;
  let mediaMime = msg.mediaMime ?? null;
  if (!(msg.mediaId || msg.mediaUrl) || !conta.access_token) {
    return { mediaUrl, mediaMime, metadata: {} };
  }
  try {
    const base = (conta.provider_base_url || "https://graph.facebook.com/v21.0").replace(
      /\/+$/,
      "",
    );
    let mediaInfo: { url?: string; mime_type?: string } = {
      url: msg.mediaUrl,
      mime_type: msg.mediaMime,
    };
    if (msg.mediaId) {
      const metaRes = await fetch(`${base}/${encodeURIComponent(msg.mediaId)}`, {
        headers: { Authorization: `Bearer ${conta.access_token}` },
      });
      if (!metaRes.ok) throw new Error(`media metadata HTTP ${metaRes.status}`);
      mediaInfo = (await metaRes.json()) as { url?: string; mime_type?: string };
    }
    if (!mediaInfo.url) throw new Error("media URL ausente");

    const fileRes = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${conta.access_token}` },
    });
    if (!fileRes.ok) throw new Error(`media download HTTP ${fileRes.status}`);

    mediaMime = mediaInfo.mime_type || fileRes.headers.get("content-type") || mediaMime;
    const ext = extensionFromMime(mediaMime, msg.type);
    const safeMessageId = msg.providerMessageId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `inbound/${msg.accountId}/${msg.phone}/${safeMessageId}${ext}`;
    const bytes = await fileRes.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from("whatsapp-media")
      .upload(storagePath, bytes, {
        contentType: mediaMime ?? "application/octet-stream",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const { data: signed } = await admin.storage
      .from("whatsapp-media")
      .createSignedUrl(storagePath, 60 * 60 * 24);
    mediaUrl = signed?.signedUrl ?? null;
    return {
      mediaUrl,
      mediaMime,
      metadata: {
        provider_media_id: msg.mediaId ?? null,
        storage_bucket: "whatsapp-media",
        storage_path: storagePath,
      },
    };
  } catch (e) {
    console.error("[wa webhook] media download error", e);
    return {
      mediaUrl,
      mediaMime,
      metadata: {
        provider_media_id: msg.mediaId ?? null,
        media_error: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

export function extensionFromMime(mime: string | null, type: string) {
  const normalized = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (normalized === "audio/ogg") return ".ogg";
  if (normalized === "audio/mpeg") return ".mp3";
  if (normalized === "audio/mp4") return ".m4a";
  if (normalized === "audio/aac") return ".aac";
  if (normalized === "audio/amr") return ".amr";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "video/mp4") return ".mp4";
  if (normalized === "application/pdf") return ".pdf";
  if (type === "audio") return ".ogg";
  if (type === "image") return ".jpg";
  if (type === "video") return ".mp4";
  return "";
}
