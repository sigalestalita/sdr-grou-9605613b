import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SlideDoAcervo } from "@/lib/propostas/acervo";

/*
 * Acervo de slides da apresentação comercial: a gestão importa a apresentação
 * uma vez (cada slide com o serviço/produto), e o comercial escolhe do acervo
 * o que vai em cada proposta. Quem pode propor gerencia (RLS pode_propor).
 */
const solto = (s: unknown) => s as SupabaseClient;
const COLS = "id, ordem, programa, secao, titulo, imagem_url, ativo, importacao, atualizado_em";

type Linha = {
  id: string;
  ordem: number;
  programa: string;
  secao: string;
  titulo: string | null;
  imagem_url: string;
  ativo: boolean;
  importacao: string;
  atualizado_em: string;
};

const paraSlide = (r: Linha): SlideDoAcervo => ({
  id: r.id,
  ordem: r.ordem,
  programa: r.programa,
  secao: r.secao,
  titulo: r.titulo,
  imagemUrl: r.imagem_url,
  ativo: r.ativo,
});

export const listarAcervo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await solto(context.supabase)
      .from("proposta_acervo_slides")
      .select(COLS)
      .order("ordem");
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as Linha[];
    // O bucket é privado: as miniaturas da tela usam URL assinada (12 h).
    const caminhos = linhas.map((r) => r.imagem_url.split("/propostas-slides/")[1] ?? "");
    const assinadas = new Map<string, string>();
    const validos = caminhos.filter(Boolean);
    for (let i = 0; i < validos.length; i += 200) {
      const { data: urls } = await solto(context.supabase)
        .storage.from("propostas-slides")
        .createSignedUrls(validos.slice(i, i + 200), 60 * 60 * 12);
      for (const u of urls ?? []) if (u.path && u.signedUrl) assinadas.set(u.path, u.signedUrl);
    }
    return {
      slides: linhas.map((r, i) => ({
        ...paraSlide(r),
        miniatura: assinadas.get(caminhos[i]) ?? null,
      })),
      importadoEm: linhas.reduce<string | null>(
        (m, r) => (!m || r.atualizado_em > m ? r.atualizado_em : m),
        null,
      ),
    };
  });

const slideZ = z.object({
  ordem: z.number().int().min(1).max(1000),
  programa: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  secao: z.string().trim().min(1).max(120),
  titulo: z.string().trim().max(300).nullable(),
  imagemUrl: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.includes("/propostas-slides/acervo/"), "Imagem fora da pasta do acervo"),
});

/** Troca o acervo inteiro pelos slides de uma importação (as imagens já foram enviadas). */
export const importarAcervo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        importacao: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z0-9_-]+$/),
        slides: z.array(slideZ).min(1).max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    // Primeiro grava o novo; só depois tira o antigo (se a gravação falhar, o
    // acervo anterior continua valendo).
    const { error: insErr } = await db.from("proposta_acervo_slides").insert(
      data.slides.map((s) => ({
        ordem: s.ordem,
        programa: s.programa,
        secao: s.secao,
        titulo: s.titulo,
        imagem_url: s.imagemUrl,
        importacao: data.importacao,
      })),
    );
    if (insErr) throw new Error(insErr.message);
    const { error: delErr } = await db
      .from("proposta_acervo_slides")
      .delete()
      .neq("importacao", data.importacao);
    if (delErr) throw new Error(delErr.message);
    return { ok: true, slides: data.slides.length };
  });

/** Esconde/mostra um slide ou troca a seção dele. */
export const atualizarSlideDoAcervo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(400),
        ativo: z.boolean().optional(),
        programa: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        secao: z.string().trim().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (data.ativo !== undefined) patch.ativo = data.ativo;
    if (data.programa) patch.programa = data.programa;
    if (data.secao) patch.secao = data.secao;
    const { error } = await solto(context.supabase)
      .from("proposta_acervo_slides")
      .update(patch)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
