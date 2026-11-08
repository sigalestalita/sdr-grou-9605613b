import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Anotações e tarefas dos negócios de um contato. No RD a tela do contato
 * mostrava as anotações dos negócios dele; aqui o lead (que é o contato no
 * Compass) mostra o mesmo.
 */
export const anotacoesDoContato = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const [{ data: vinculos }, { data: principais }] = await Promise.all([
      db.from("deal_contacts").select("deal_id").eq("contact_id", data.contactId).limit(200),
      db.from("deals").select("id").eq("contact_id", data.contactId).limit(200),
    ]);
    const ids = [
      ...new Set(
        [...((vinculos ?? []) as Array<{ deal_id: string }>).map((v) => v.deal_id)].concat(
          ((principais ?? []) as Array<{ id: string }>).map((p) => p.id),
        ),
      ),
    ];
    if (!ids.length) return [];
    const [{ data: negocios }, { data: atividades }] = await Promise.all([
      db.from("deals").select("id, nome").in("id", ids),
      db
        .from("deal_activities")
        .select("id, deal_id, tipo, descricao, occurred_at, author_id, rd_autor")
        .in("deal_id", ids)
        .neq("tipo", "etapa")
        .order("occurred_at", { ascending: false })
        .limit(200),
    ]);
    const nome = new Map(
      ((negocios ?? []) as Array<{ id: string; nome: string | null }>).map((n) => [n.id, n.nome]),
    );
    const lista = (atividades ?? []) as Array<{
      id: string;
      deal_id: string;
      tipo: string;
      descricao: string | null;
      occurred_at: string;
      author_id: string | null;
      rd_autor: string | null;
    }>;
    const autores = [...new Set(lista.map((a) => a.author_id).filter(Boolean))] as string[];
    const { data: perfis } = autores.length
      ? await db.from("profiles").select("id, full_name").in("id", autores)
      : { data: [] };
    const quem = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name,
      ]),
    );
    return lista.map((a) => ({
      id: a.id,
      dealId: a.deal_id,
      negocio: nome.get(a.deal_id) ?? "Negócio",
      tipo: a.tipo,
      texto: a.descricao ?? "",
      em: a.occurred_at,
      autor: (a.author_id ? quem.get(a.author_id) : null) ?? a.rd_autor ?? null,
    }));
  });
