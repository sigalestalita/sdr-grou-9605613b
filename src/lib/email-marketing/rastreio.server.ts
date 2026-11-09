import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* Rastreio próprio de abertura, clique e descadastro, pelo token do envio. */
const db = () => supabaseAdmin as unknown as SupabaseClient;
type Envio = {
  id: string;
  email: string;
  campanha_id: string;
  aberturas: number;
  cliques: number;
  aberto_em: string | null;
  clicado_em: string | null;
  descadastrou_em: string | null;
};
const TOKEN = /^[a-f0-9]{32}$/;

export async function envioPorToken(token: string): Promise<Envio | null> {
  if (!TOKEN.test(token)) return null;
  const { data } = await db()
    .from("email_envios")
    .select("id, email, campanha_id, aberturas, cliques, aberto_em, clicado_em, descadastrou_em")
    .eq("token", token)
    .maybeSingle();
  return (data as Envio | null) ?? null;
}

export async function registrarAbertura(token: string) {
  const e = await envioPorToken(token);
  if (!e) return;
  await db()
    .from("email_envios")
    .update({ aberturas: e.aberturas + 1, aberto_em: e.aberto_em ?? new Date().toISOString() })
    .eq("id", e.id);
}

export async function registrarClique(token: string) {
  const e = await envioPorToken(token);
  if (!e) return;
  const agora = new Date().toISOString();
  await db()
    .from("email_envios")
    .update({
      cliques: e.cliques + 1,
      clicado_em: e.clicado_em ?? agora,
      // Quem clicou abriu, mesmo com imagens bloqueadas.
      aberto_em: e.aberto_em ?? agora,
    })
    .eq("id", e.id);
}

export async function descadastrar(token: string, motivo?: string | null) {
  const e = await envioPorToken(token);
  if (!e) return { ok: false as const };
  await db()
    .from("email_descadastros")
    .upsert(
      {
        email: e.email.toLowerCase(),
        origem: "link",
        motivo: motivo ?? null,
        campanha_id: e.campanha_id,
      },
      { onConflict: "email", ignoreDuplicates: true },
    );
  if (!e.descadastrou_em)
    await db()
      .from("email_envios")
      .update({ descadastrou_em: new Date().toISOString() })
      .eq("id", e.id);
  return { ok: true as const, email: e.email };
}
