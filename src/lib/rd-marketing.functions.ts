import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Importa a base de marketing do RD para dentro do Compass.
 *
 * São os leads que converteram em conteúdo e nunca viraram negociação — a
 * outra metade da migração, já que contatos e negócios do RD CRM vieram por
 * outro caminho.
 *
 * Duas decisões que valem registro:
 *
 * 1) Entram OCULTOS do kanban. O kanban lê a tabela de leads paginando até o
 *    fim, então 70 mil linhas visíveis param a tela — foi o que travou na
 *    tentativa anterior. A política de RLS já esconde quem tem oculto_sdr.
 *
 * 2) Não se sobrepõem ao que já existe. Um lead que veio do CRM, ou que o SDR
 *    trabalhou, tem dado melhor do que uma planilha de marketing; o import só
 *    completa campo vazio e nunca reescreve o que já está preenchido.
 */

export const LinhaSchema = z.object({
  rdMarketingId: z.string().max(120).nullable(),
  nome: z.string().max(200).nullable(),
  email: z.string().max(200).nullable(),
  telefone: z.string().max(60).nullable(),
  empresa: z.string().max(200).nullable(),
  cargo: z.string().max(200).nullable(),
  website: z.string().max(300).nullable(),
  criadoEm: z.string().max(60).nullable(),
  conversoes: z.number().nullable(),
  ultimaConversao: z.string().max(60).nullable(),
  nomeUltimaConversao: z.string().max(300).nullable(),
});

export const importarLoteDeMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linhas: z.array(LinhaSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores importam a base do RD.");
    const { importarLeadsDeMarketing } = await import("@/lib/rd/marketing.server");
    return importarLeadsDeMarketing(data.linhas);
  });
