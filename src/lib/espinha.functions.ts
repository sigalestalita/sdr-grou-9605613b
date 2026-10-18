import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Espinha dorsal: Empresa × Contato × Negócio.
 *
 * O card do SDR é a pessoa (lead). Ela fica ligada a um contato e, quando se
 * sabe, a uma empresa (vincular_lead, no banco). O negócio nasce quando o SDR
 * passa o lead para o executivo (passar_lead_para_executivo) — pelo convite de
 * reunião ou pelo botão no lead.
 */
const solto = (s: unknown) => s as SupabaseClient;

export const listarExecutivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const { data: roles } = await db.from("user_roles").select("user_id").eq("role", "executivo");
    const ids = ((roles ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    if (!ids.length) return [];
    const { data } = await db.from("profiles").select("id, full_name, email").in("id", ids);
    return ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
      .map((p) => ({ id: p.id, nome: p.full_name || p.email || p.id }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

/** Onde o lead está na espinha: contato, empresa e negócio. */
export const getLeadNaEspinha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: lead, error } = await db
      .from("leads")
      .select(
        "id, deal_id, executivo_id, contacts:contact_id(id, nome), companies:company_id(id, nome, tipo_lead), deals:deal_id(id, nome, status)",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead não encontrado");
    const l = lead as Record<string, unknown>;
    const empresaId = (l.companies as { id: string } | null)?.id;
    // A página da empresa hoje é a ficha do CS: só há link quando ela existe.
    const { data: ficha } = empresaId
      ? await db
          .from("cs_clients")
          .select("client_uid")
          .eq("company_id", empresaId)
          .limit(1)
          .maybeSingle()
      : { data: null };
    return {
      fichaCs: (ficha as { client_uid: string } | null)?.client_uid ?? null,
      contato: (l.contacts as { id: string; nome: string } | null) ?? null,
      empresa: (l.companies as { id: string; nome: string; tipo_lead: string } | null) ?? null,
      negocio: (l.deals as { id: string; nome: string; status: string } | null) ?? null,
      executivoId: (l.executivo_id as string | null) ?? null,
    };
  });

export const passarParaExecutivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        executivoId: z.string().uuid(),
        nome: z.string().trim().max(200).optional(),
        valor: z.number().min(0).max(100_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: dealId, error } = await db.rpc("passar_lead_para_executivo", {
      _lead: data.leadId,
      _executivo: data.executivoId,
      _nome: data.nome ?? null,
      _valor: data.valor ?? null,
    });
    if (error) throw new Error(error.message);
    const id = dealId as string;
    const { data: deal } = await db.from("deals").select("nome").eq("id", id).maybeSingle();
    // Avisa o executivo (menção: qualquer pessoa do comercial pode mandar).
    await db.rpc("notificar_usuarios", {
      _users: [data.executivoId],
      _tipo: "mencao",
      _titulo: `Novo negócio para você: ${(deal as { nome?: string } | null)?.nome ?? ""}`,
      _corpo: "Lead passado pelo SDR.",
      _link: `/negocio/${id}`,
      _deal_id: id,
    });
    return { dealId: id };
  });
