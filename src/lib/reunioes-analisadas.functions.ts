import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Reuniões analisadas no Sales Coach (tabela reunioes_analisadas): todas as de
 * uma empresa (ficha) ou as de um negócio. Cada uma traz quem conduziu, o
 * contato, o negócio (quando é de venda), os campos da análise com o nome que
 * o Sales Coach deu, o resumo e o próximo passo.
 */
export type ReuniaoAnalisada = {
  id: string;
  tipo: "venda" | "atendimento";
  titulo: string | null;
  realizadaEm: string | null;
  conduzidaPorId: string | null;
  conduzidaPor: string;
  contatoId: string | null;
  contato: string | null;
  negocioId: string | null;
  negocio: string | null;
  campos: Array<{ chave: string; rotulo: string; valor: string }>;
  resumo: string | null;
  proximoPasso: string | null;
  proximoPassoEm: string | null;
  link: string | null;
};

const rotulo = (label: string) => label.replace(/^Sales Coach\s*·\s*/i, "").trim() || label;

export function valorDoCampo(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v))
    return (
      v
        .map((x) => valorDoCampo(x))
        .filter(Boolean)
        .join(", ") || null
    );
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function carregar(
  db: SupabaseClient,
  filtro: { companyId?: string; dealId?: string },
): Promise<ReuniaoAnalisada[]> {
  let q = db
    .from("reunioes_analisadas")
    .select(
      "id, tipo, titulo, realizada_em, criado_em, conduzida_por, conduzida_por_nome, conduzida_por_email, contact_id, participante_nome, participante_email, deal_id, campos, resumo, proximo_passo, proximo_passo_em, link",
    )
    .order("realizada_em", { ascending: false, nullsFirst: false })
    .order("criado_em", { ascending: false })
    .limit(200);
  if (filtro.companyId) q = q.eq("company_id", filtro.companyId);
  if (filtro.dealId) q = q.eq("deal_id", filtro.dealId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  type Linha = {
    id: string;
    tipo: "venda" | "atendimento";
    titulo: string | null;
    realizada_em: string | null;
    criado_em: string;
    conduzida_por: string | null;
    conduzida_por_nome: string | null;
    conduzida_por_email: string | null;
    contact_id: string | null;
    participante_nome: string | null;
    participante_email: string | null;
    deal_id: string | null;
    campos: Record<string, unknown> | null;
    resumo: string | null;
    proximo_passo: string | null;
    proximo_passo_em: string | null;
    link: string | null;
  };
  const linhas = (data ?? []) as Linha[];
  if (!linhas.length) return [];
  const ids = (xs: Array<string | null>) => [...new Set(xs.filter(Boolean) as string[])];
  const [campos, perfis, contatos, negocios] = await Promise.all([
    db.from("salescoach_campos").select("key, label").order("criado_em"),
    ids(linhas.map((l) => l.conduzida_por)).length
      ? db
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids(linhas.map((l) => l.conduzida_por)))
      : Promise.resolve({ data: [] }),
    ids(linhas.map((l) => l.contact_id)).length
      ? db
          .from("contacts")
          .select("id, nome")
          .in("id", ids(linhas.map((l) => l.contact_id)))
      : Promise.resolve({ data: [] }),
    ids(linhas.map((l) => l.deal_id)).length
      ? db
          .from("deals")
          .select("id, nome")
          .in("id", ids(linhas.map((l) => l.deal_id)))
      : Promise.resolve({ data: [] }),
  ]);
  const ordem = ((campos.data ?? []) as Array<{ key: string; label: string }>).map((c) => ({
    key: c.key,
    rotulo: rotulo(c.label),
  }));
  const pessoa = new Map(
    (
      (perfis.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
    ).map((p) => [p.id, p.full_name || p.email || "—"]),
  );
  const contato = new Map(
    ((contatos.data ?? []) as Array<{ id: string; nome: string }>).map((c) => [c.id, c.nome]),
  );
  const negocio = new Map(
    ((negocios.data ?? []) as Array<{ id: string; nome: string }>).map((n) => [n.id, n.nome]),
  );
  return linhas.map((l) => {
    const valores = l.campos ?? {};
    const conhecidos = new Set(ordem.map((o) => o.key));
    const lista = [
      ...ordem.map((o) => ({
        chave: o.key,
        rotulo: o.rotulo,
        valor: valorDoCampo(valores[o.key]),
      })),
      ...Object.keys(valores)
        .filter((k) => !conhecidos.has(k) && k !== "atualizado_em")
        .map((k) => ({ chave: k, rotulo: k, valor: valorDoCampo(valores[k]) })),
    ].filter((c): c is { chave: string; rotulo: string; valor: string } => !!c.valor);
    return {
      id: l.id,
      tipo: l.tipo,
      titulo: l.titulo,
      realizadaEm: l.realizada_em ?? l.criado_em,
      conduzidaPorId: l.conduzida_por,
      conduzidaPor:
        (l.conduzida_por ? pessoa.get(l.conduzida_por) : null) ??
        l.conduzida_por_nome ??
        l.conduzida_por_email ??
        "—",
      contatoId: l.contact_id,
      contato:
        (l.contact_id ? contato.get(l.contact_id) : null) ??
        l.participante_nome ??
        l.participante_email ??
        null,
      negocioId: l.deal_id,
      negocio: l.deal_id ? (negocio.get(l.deal_id) ?? "Negócio") : null,
      campos: lista,
      resumo: l.resumo,
      proximoPasso: l.proximo_passo,
      proximoPassoEm: l.proximo_passo_em,
      link: l.link,
    };
  });
}

export const reunioesAnalisadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ companyId: z.string().uuid().optional(), dealId: z.string().uuid().optional() })
      .refine((x) => !!x.companyId !== !!x.dealId, "Informe a empresa ou o negócio")
      .parse(d),
  )
  .handler(async ({ data, context }) =>
    carregar(context.supabase as unknown as SupabaseClient, data),
  );
