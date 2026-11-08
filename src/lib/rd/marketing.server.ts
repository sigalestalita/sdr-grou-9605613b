import type { z } from "zod";
import type { LinhaSchema } from "@/lib/rd-marketing.functions";

/*
 * Base de marketing do RD → leads (ocultos do kanban), com a empresa achada
 * por domínio ou nome e a última conversão. Usado pela tela e pelo hook de
 * migração.
 */
function dataOuNulo(v: string | null): string | null {
  if (!v) return null;
  // O export do RD vem em dd/mm/aaaa; Date não entende isso.
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : v;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function importarLeadsDeMarketing(linhas: Array<z.infer<typeof LinhaSchema>>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { phoneKey } = await import("@/lib/whatsapp/phone");
  const { dominioCorporativo, nomeNormalizado } = await import("@/lib/rd/importar-marketing");

  let criados = 0;
  let completados = 0;
  let intocados = 0;
  let conversoes = 0;
  const vinculos = { porDominio: 0, porNome: 0, semEmpresa: 0 };

  /*
   * Achar a empresa do contato.
   *
   * A base de marketing não traz CNPJ nem identificador — só um nome digitado
   * à mão e um e-mail. Sobram duas chaves, e elas não têm a mesma confiança:
   * domínio corporativo é praticamente certeza, nome é palpite bom.
   *
   * Empresa que não existe não é criada. Criar quarenta mil empresas a partir
   * de nome livre encheria o cadastro de duplicata e erro de digitação — pior
   * do que deixar o texto no lead e alguém promover quando for trabalhar.
   */
  async function acharEmpresa(l: {
    email: string | null;
    empresa: string | null;
  }): Promise<{ id: string; via: "dominio" | "nome" } | null> {
    const dom = dominioCorporativo(l.email);
    if (dom) {
      const { data } = await db
        .from("companies")
        .select("id")
        .ilike("dominio", dom)
        .limit(1)
        .maybeSingle();
      if (data) return { id: (data as { id: string }).id, via: "dominio" };
    }
    const nome = nomeNormalizado(l.empresa);
    if (nome) {
      const { data } = await db
        .from("companies")
        .select("id")
        .eq("nome_normalizado", nome)
        .limit(1)
        .maybeSingle();
      if (data) return { id: (data as { id: string }).id, via: "nome" };
    }
    return null;
  }

  /*
   * Os tipos gerados ainda não conhecem phone_key nem rd_marketing_id: as
   * duas colunas entram na migration desta importação.
   */
  type LeadCasado = { id: string; email: string | null } | null;
  const db = supabaseAdmin as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (t: string) => any;
  };

  for (const l of linhas) {
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

    const empresa = await acharEmpresa(l);
    if (empresa) {
      if (empresa.via === "dominio") vinculos.porDominio += 1;
      else vinculos.porNome += 1;
    } else {
      vinculos.semEmpresa += 1;
    }

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
          company_id: empresa?.id ?? null,
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
        .select("email, phone, company_name, position, company_website, company_id")
        .eq("id", leadId)
        .maybeSingle();
      const a = (atual ?? {}) as Record<string, string | null>;
      if (!a.email && l.email) patch.email = l.email;
      if (!a.phone && l.telefone) patch.phone = l.telefone;
      if (!a.company_name && l.empresa) patch.company_name = l.empresa;
      if (!a.position && l.cargo) patch.position = l.cargo;
      if (!a.company_website && l.website) patch.company_website = l.website;
      if (!a.company_id && empresa) patch.company_id = empresa.id;

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

  return { criados, completados, intocados, conversoes, vinculos };
}
