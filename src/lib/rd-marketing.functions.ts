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

const LinhaSchema = z.object({
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

function dataOuNulo(v: string | null): string | null {
  if (!v) return null;
  // O export do RD vem em dd/mm/aaaa; Date não entende isso.
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : v;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const importarLoteDeMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ linhas: z.array(LinhaSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores importam a base do RD.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { phoneKey } = await import("@/lib/whatsapp/phone");

    let criados = 0;
    let completados = 0;
    let intocados = 0;
    let conversoes = 0;

    /*
     * Os tipos gerados ainda não conhecem phone_key nem rd_marketing_id: as
     * duas colunas entram na migration desta importação.
     */
    type LeadCasado = { id: string; email: string | null } | null;
    const db = supabaseAdmin as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (t: string) => any;
    };

    for (const l of data.linhas) {
      // Casa por e-mail e por telefone: o mesmo lead pode ter entrado pelos dois.
      let existente: LeadCasado = null;

      if (l.email) {
        const { data: porEmail } = await db
          .from("leads")
          .select("id, email")
          .ilike("email", l.email)
          .limit(1)
          .maybeSingle();
        existente = (porEmail as LeadCasado) ?? null;
      }
      if (!existente && l.telefone) {
        const chave = phoneKey(l.telefone);
        if (chave) {
          const { data: porTelefone } = await db
            .from("leads")
            .select("id, email")
            .eq("phone_key", chave)
            .limit(1)
            .maybeSingle();
          existente = (porTelefone as LeadCasado) ?? null;
        }
      }

      let leadId: string | null = existente?.id ?? null;

      if (!leadId) {
        const { data: novo, error } = await db
          .from("leads")
          .insert({
            name: l.nome ?? l.email ?? "Lead do RD",
            email: l.email,
            phone: l.telefone,
            company_name: l.empresa,
            position: l.cargo,
            company_website: l.website,
            source: "rd_marketing",
            rd_marketing_id: l.rdMarketingId,
            created_at: dataOuNulo(l.criadoEm) ?? new Date().toISOString(),
            // Fora do kanban: é base de marketing, não fila de trabalho.
            oculto_sdr: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        leadId = (novo as { id: string }).id;
        criados += 1;
      } else {
        /*
         * Só completa buraco.
         *
         * Quem já está na base veio do CRM ou foi trabalhado pelo SDR, e esse
         * dado vale mais do que planilha de marketing. Sobrescrever apagaria
         * empresa e cargo corrigidos à mão.
         */
        const patch: Record<string, unknown> = { rd_marketing_id: l.rdMarketingId };
        const { data: atual } = await db
          .from("leads")
          .select("email, phone, company_name, position, company_website")
          .eq("id", leadId)
          .maybeSingle();
        const a = (atual ?? {}) as Record<string, string | null>;
        if (!a.email && l.email) patch.email = l.email;
        if (!a.phone && l.telefone) patch.phone = l.telefone;
        if (!a.company_name && l.empresa) patch.company_name = l.empresa;
        if (!a.position && l.cargo) patch.position = l.cargo;
        if (!a.company_website && l.website) patch.company_website = l.website;

        if (Object.keys(patch).length > 1) completados += 1;
        else intocados += 1;
        await db.from("leads").update(patch).eq("id", leadId);
      }

      // A última conversão é o que o export traz de histórico.
      if (leadId && l.nomeUltimaConversao) {
        const { error } = await db.from("lead_conversoes").upsert(
          {
            lead_id: leadId,
            nome: l.nomeUltimaConversao,
            origem: "rd_marketing",
            ocorrida_em: dataOuNulo(l.ultimaConversao),
            payload: { total_de_conversoes: l.conversoes },
          },
          { onConflict: "lead_id,nome,ocorrida_em", ignoreDuplicates: true },
        );
        if (!error) conversoes += 1;
      }
    }

    return { criados, completados, intocados, conversoes };
  });
