import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fichaDoCsv, lerCsv, mesmoNome, normalizarFicha, type FichaEntrada } from "./normalizar";

const db = () => supabaseAdmin as unknown as SupabaseClient;

const REGIME_COMPASS: Record<string, string> = {
  "Simples Nacional": "Simples Nacional",
  "Lucro Presumido": "Lucro Presumido",
  "Lucro Real": "Lucro Real",
};

export async function segredoDoWebhook(): Promise<string | null> {
  const { data } = await db()
    .from("app_settings")
    .select("value")
    .eq("key", "ficha_cadastral_webhook")
    .maybeSingle();
  return (
    ((data as { value?: { secret?: string } } | null)?.value?.secret as string | undefined) ?? null
  );
}

/** Empresas do Compass por CNPJ (o cadastro guarda só dígitos na maioria). */
export async function empresasPorDocumento(docs: string[]) {
  const unicos = [...new Set(docs.filter((d) => d.length === 14))];
  const mapa = new Map<string, { id: string; uid: string; nome: string }>();
  for (let i = 0; i < unicos.length; i += 200) {
    const lote = unicos.slice(i, i + 200);
    const { data } = await db().from("companies").select("id, uid, nome, cnpj").in("cnpj", lote);
    for (const c of (data ?? []) as Array<{
      id: string;
      uid: string;
      nome: string;
      cnpj: string;
    }>) {
      mapa.set(c.cnpj, { id: c.id, uid: c.uid, nome: c.nome });
    }
  }
  return mapa;
}

/**
 * Recebe uma ficha do app de cadastro: grava (ou atualiza, se reenviada),
 * liga à empresa pelo CNPJ e ao contato pelo e-mail, completa os campos
 * vazios da empresa e avisa o vendedor escolhido na ficha.
 */
export async function receberFicha(corpo: unknown) {
  const bruto = (
    corpo && typeof corpo === "object" && "record" in corpo
      ? (corpo as { record: FichaEntrada }).record
      : corpo
  ) as FichaEntrada;
  if (!bruto || typeof bruto !== "object") throw new Error("Ficha vazia");
  const f = normalizarFicha(bruto);

  const empresa = f.documento
    ? ((await empresasPorDocumento([f.documento])).get(f.documento) ?? null)
    : null;
  let contatoId: string | null = null;
  if (f.email) {
    const { data } = await db()
      .from("contacts")
      .select("id")
      .ilike("email", f.email)
      .limit(1)
      .maybeSingle();
    contatoId = (data as { id: string } | null)?.id ?? null;
  }
  const { data: perfis } = await db().from("profiles").select("id, full_name");
  const vendedor = ((perfis ?? []) as Array<{ id: string; full_name: string | null }>).find((p) =>
    mesmoNome(p.full_name, f.vendedorNome),
  );

  const linha = {
    externo_id: f.externoId,
    origem: "webhook",
    tipo: f.tipo,
    documento: f.documento,
    nome: f.nome,
    nome_fantasia: f.nomeFantasia,
    email: f.email,
    vendedor_nome: f.vendedorNome,
    vendedor_user_id: vendedor?.id ?? null,
    cidade: f.cidade,
    estado: f.estado,
    dados: f.dados,
    company_id: empresa?.id ?? null,
    contact_id: contatoId,
    enviada_em: f.enviadaEm,
    updated_at: new Date().toISOString(),
  };
  const { data: salva, error } = f.externoId
    ? await db()
        .from("fichas_cadastrais")
        .upsert(linha, { onConflict: "externo_id" })
        .select("id")
        .single()
    : await db().from("fichas_cadastrais").insert(linha).select("id").single();
  if (error) throw new Error(error.message);

  // Completa o que a empresa ainda não tem (nunca sobrescreve).
  if (empresa) {
    const { data: atual } = await db()
      .from("companies")
      .select(
        "cidade, estado, cep, telefone, segmento, site_url, regime_tributario, num_funcionarios",
      )
      .eq("id", empresa.id)
      .maybeSingle();
    const a = (atual ?? {}) as Record<string, unknown>;
    const d = f.dados;
    const patch: Record<string, unknown> = {};
    const se = (col: string, v: unknown) => {
      if ((a[col] == null || a[col] === "") && v != null && v !== "") patch[col] = v;
    };
    se("cidade", d.cidade);
    se("estado", d.estado?.toUpperCase());
    se("cep", d.cep);
    se("telefone", d.telefone);
    se("segmento", d.segmento);
    se("site_url", d.site);
    se("regime_tributario", REGIME_COMPASS[d.regime_tributario ?? ""]);
    const func = Number((d.numero_funcionarios ?? "").replace(/\D/g, ""));
    if (func > 0) se("num_funcionarios", func);
    if (Object.keys(patch).length) await db().from("companies").update(patch).eq("id", empresa.id);
  }

  if (vendedor) {
    await db()
      .from("notificacoes")
      .insert({
        user_id: vendedor.id,
        tipo: "ficha",
        titulo: `Ficha cadastral recebida: ${f.nomeFantasia ?? f.nome}`.slice(0, 200),
        corpo: empresa
          ? `Ligada à empresa ${empresa.nome}.`
          : `${f.tipo} ${f.documento ?? ""} ainda não tem empresa no Compass.`,
        link: empresa ? `/empresas/${empresa.uid}` : "/propostas?aba=fichas",
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
  return {
    id: (salva as { id: string }).id,
    empresa: empresa?.nome ?? null,
    vendedor: vendedor?.full_name ?? null,
  };
}

/** Liga fichas soltas a empresas que passaram a existir (ou ganharam CNPJ). */
export async function religarFichasSoltas() {
  const { data } = await db()
    .from("fichas_cadastrais")
    .select("id, documento")
    .is("company_id", null)
    .eq("tipo", "CNPJ")
    .not("documento", "is", null)
    .limit(1000);
  const soltas = (data ?? []) as Array<{ id: string; documento: string }>;
  if (!soltas.length) return 0;
  const mapa = await empresasPorDocumento(soltas.map((s) => s.documento));
  let n = 0;
  for (const s of soltas) {
    const e = mapa.get(s.documento);
    if (!e) continue;
    await db().from("fichas_cadastrais").update({ company_id: e.id }).eq("id", s.id);
    n++;
  }
  return n;
}

/**
 * Histórico: CSV "Todos" exportado do painel da ficha. Liga empresa (CNPJ),
 * contato (e-mail) e vendedor; não avisa ninguém; reimportar não duplica.
 */
export async function importarCsvDeFichas(texto: string) {
  const fichas = lerCsv(texto)
    .map(fichaDoCsv)
    .filter((f): f is NonNullable<ReturnType<typeof fichaDoCsv>> => !!f);
  if (!fichas.length)
    throw new Error("Nenhuma ficha no arquivo (use o CSV da aba Todos do painel)");
  const { data: ja } = await db()
    .from("fichas_cadastrais")
    .select("documento, enviada_em")
    .eq("origem", "csv")
    .limit(5000);
  const vistas = new Set(
    ((ja ?? []) as Array<{ documento: string | null; enviada_em: string }>).map(
      (r) => `${r.documento}|${new Date(r.enviada_em).toISOString()}`,
    ),
  );
  const empresas = await empresasPorDocumento(fichas.map((f) => f.documento ?? ""));
  const emails = [...new Set(fichas.map((f) => f.email).filter((e): e is string => !!e))];
  const contatos = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await db()
      .from("contacts")
      .select("id, email")
      .in("email", emails.slice(i, i + 200));
    for (const c of (data ?? []) as Array<{ id: string; email: string }>)
      contatos.set(c.email.toLowerCase(), c.id);
  }
  const { data: perfis } = await db().from("profiles").select("id, full_name");
  const ps = (perfis ?? []) as Array<{ id: string; full_name: string | null }>;

  const novas = [];
  for (const f of fichas) {
    const chave = `${f.documento}|${new Date(f.enviadaEm).toISOString()}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    novas.push({
      origem: "csv",
      tipo: f.tipo,
      documento: f.documento,
      nome: f.nome,
      email: f.email,
      vendedor_nome: f.vendedorNome,
      vendedor_user_id: ps.find((p) => mesmoNome(p.full_name, f.vendedorNome))?.id ?? null,
      cidade: f.cidade,
      estado: f.estado,
      dados: f.dados,
      company_id: (f.documento && empresas.get(f.documento)?.id) || null,
      contact_id: (f.email && contatos.get(f.email)) || null,
      enviada_em: f.enviadaEm,
    });
  }
  for (let i = 0; i < novas.length; i += 200) {
    const { error } = await db()
      .from("fichas_cadastrais")
      .insert(novas.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return {
    lidas: fichas.length,
    novas: novas.length,
    repetidas: fichas.length - novas.length,
    comEmpresa: novas.filter((n) => n.company_id).length,
  };
}
