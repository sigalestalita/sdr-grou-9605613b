import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Contatos da base (todas as pessoas de todas as empresas), para todos os
 * times. Busca e filtros no servidor, de 50 em 50.
 */
export const ContatosFiltroSchema = z.object({
  q: z.string().max(120).default(""),
  analista: z.boolean().default(false),
  meus: z.boolean().default(false),
  comEmail: z.boolean().default(false),
  semEmpresa: z.boolean().default(false),
  pagina: z.number().int().min(0).max(5000).default(0),
});
export type ContatosFiltro = z.infer<typeof ContatosFiltroSchema>;

const POR_PAGINA = 50;
/** Tira o que quebra o filtro "or" do PostgREST. */
const limpar = (q: string) => q.replace(/[,()*%\\]/g, " ").trim();

export const listContatos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ContatosFiltroSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = limpar(data.q);

    // Empresas com o nome buscado: os contatos delas também entram.
    let empresasDaBusca: string[] = [];
    if (q.length >= 2) {
      const { data: emps } = await supabase
        .from("companies")
        .select("id")
        .ilike("nome", `%${q}%`)
        .limit(100);
      empresasDaBusca = ((emps ?? []) as { id: string }[]).map((e) => e.id);
    }

    let query = supabase
      .from("contacts")
      .select(
        "id, nome, email, telefone, cargo, analista_pda, company_id, sdr_user_id, created_at",
        {
          count: "exact",
        },
      )
      .eq("ativo", true);
    if (q) {
      const partes = [`nome.ilike.%${q}%`, `email.ilike.%${q}%`, `telefone.ilike.%${q}%`];
      if (empresasDaBusca.length) partes.push(`company_id.in.(${empresasDaBusca.join(",")})`);
      query = query.or(partes.join(","));
    }
    if (data.analista) query = query.eq("analista_pda", true);
    if (data.meus) query = query.eq("sdr_user_id", userId);
    if (data.comEmail) query = query.not("email", "is", null);
    if (data.semEmpresa) query = query.is("company_id", null);

    const de = data.pagina * POR_PAGINA;
    const {
      data: rows,
      count,
      error,
    } = await query
      .order("nome", { ascending: true, nullsFirst: false })
      .range(de, de + POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    const contatos = (rows ?? []) as Array<{
      id: string;
      nome: string | null;
      email: string | null;
      telefone: string | null;
      cargo: string | null;
      analista_pda: boolean | null;
      company_id: string | null;
      sdr_user_id: string | null;
      created_at: string;
    }>;

    const empresaIds = [...new Set(contatos.map((c) => c.company_id).filter(Boolean))] as string[];
    const contatoIds = contatos.map((c) => c.id);
    const [empresas, leads, perfis] = await Promise.all([
      empresaIds.length
        ? supabase.from("companies").select("id, nome").in("id", empresaIds)
        : Promise.resolve({ data: [] }),
      contatoIds.length
        ? supabase.from("leads").select("id, contact_id").in("contact_id", contatoIds)
        : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    const nomeEmpresa = new Map(
      ((empresas.data ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]),
    );
    const leadDe = new Map(
      ((leads.data ?? []) as { id: string; contact_id: string }[]).map((l) => [l.contact_id, l.id]),
    );
    const pessoa = new Map(
      ((perfis.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
        (p) => [p.id, p.full_name || p.email || "—"],
      ),
    );

    return {
      total: count ?? 0,
      porPagina: POR_PAGINA,
      contatos: contatos.map((c) => ({
        ...c,
        empresa: c.company_id ? (nomeEmpresa.get(c.company_id) ?? null) : null,
        leadId: leadDe.get(c.id) ?? null,
        sdr: c.sdr_user_id ? (pessoa.get(c.sdr_user_id) ?? null) : null,
      })),
    };
  });
