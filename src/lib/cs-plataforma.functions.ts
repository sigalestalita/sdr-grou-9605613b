import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Quem da empresa usa a Plataforma de CS (sincronizado todo dia às 08:10). */
export const usoDaPlataformaCs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    // tabela nova, ainda fora dos tipos gerados
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("cs_plataforma_uso")
      .select(
        "email, nome, ligado_por, ultimo_acesso, aulas_90d, modulos_90d, ultima_atividade, atualizado_em",
      )
      .eq("client_uid", data.clientUid)
      .order("ultima_atividade", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      email: string;
      nome: string | null;
      ligado_por: "email" | "dominio";
      ultimo_acesso: string | null;
      aulas_90d: number;
      modulos_90d: number;
      ultima_atividade: string | null;
      atualizado_em: string;
    }>;
  });
