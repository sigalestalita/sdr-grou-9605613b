import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailsDosUsuarios, enviarEmailInterno, esc } from "@/lib/email-interno.server";
import { completarPolitica, politicaDaFicha } from "./politica-da-ficha";
import {
  CAMPOS_FICHA,
  formatarDocumento,
  fichaDoCsv,
  lerCsv,
  mesmoNome,
  normalizarFicha,
  type FichaEntrada,
} from "./normalizar";

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

  if (empresa) await aplicarFichaNaEmpresa(empresa.id, f.dados, f.enviadaEm);

  if (vendedor) {
    const fichaId = (salva as { id: string }).id;
    const sugestoes = empresa ? [] : await sugestoesDeEmpresa(f.nome, f.nomeFantasia);
    await avisarVendedor({
      vendedorId: vendedor.id,
      fichaId,
      nome: f.nomeFantasia ?? f.nome,
      tipo: f.tipo,
      documento: f.documento,
      dados: f.dados,
      empresa,
      sugestoes,
    });
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
    const { data: f } = await db()
      .from("fichas_cadastrais")
      .select("dados, enviada_em")
      .eq("id", s.id)
      .maybeSingle();
    const fi = f as { dados: Record<string, string>; enviada_em: string } | null;
    if (fi) await aplicarFichaNaEmpresa(e.id, fi.dados ?? {}, fi.enviada_em);
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

/**
 * A ficha ligada à empresa completa o que ela ainda não tem — cadastro
 * (cidade, porte, regime…) e política de faturamento (OC, forma e prazo de
 * pagamento, e-mails da NF, inscrições). Nunca sobrescreve: o ADM só confere
 * e ajusta.
 */
export async function aplicarFichaNaEmpresa(
  companyId: string,
  d: Record<string, string>,
  enviadaEm: string,
) {
  const { data: atual } = await db()
    .from("companies")
    .select(
      "cidade, estado, cep, telefone, segmento, site_url, regime_tributario, num_funcionarios",
    )
    .eq("id", companyId)
    .maybeSingle();
  const a = (atual ?? {}) as Record<string, unknown>;
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
  if (Object.keys(patch).length) await db().from("companies").update(patch).eq("id", companyId);

  const daFicha = politicaDaFicha(d);
  if (!Object.keys(daFicha).length) return;
  const { data: pol } = await db()
    .from("company_faturamento")
    .select(
      "company_id, exige_oc, forma_pagamento, prazo_tipo, prazo_valor, regime_tributario, inscricao_estadual, inscricao_municipal, emails_nf, observacoes, ficha_recebida_em",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  const p = pol as Record<string, unknown> | null;
  const mudar = completarPolitica(p, daFicha);
  const recebida =
    !p?.ficha_recebida_em || String(p.ficha_recebida_em) < enviadaEm ? enviadaEm : undefined;
  if (!Object.keys(mudar).length && !recebida) return;
  const linha = { ...mudar, ...(recebida ? { ficha_recebida_em: recebida } : {}) };
  const { error } = p
    ? await db().from("company_faturamento").update(linha).eq("company_id", companyId)
    : await db()
        .from("company_faturamento")
        .insert({ company_id: companyId, ...linha });
  if (error) console.error("[ficha→política]", error.message);
}

/** Empresas com nome parecido, para o executivo escolher quando o CNPJ não bateu. */
export async function sugestoesDeEmpresa(nome: string, fantasia: string | null) {
  const termos = [fantasia, nome]
    .filter((t): t is string => !!t)
    .map((t) =>
      t
        .replace(/\b(ltda|s\.?a\.?|eireli|me|epp|cia|comercio|industria)\b\.?/gi, " ")
        .replace(/[%,()]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((t) => t.length >= 3);
  const vistos = new Map<string, { id: string; uid: string; nome: string; cnpj: string | null }>();
  for (const t of [...new Set(termos)]) {
    const { data } = await db()
      .from("companies")
      .select("id, uid, nome, cnpj")
      .ilike("nome", `%${t}%`)
      .limit(5);
    for (const c of (data ?? []) as Array<{
      id: string;
      uid: string;
      nome: string;
      cnpj: string | null;
    }>)
      vistos.set(c.id, c);
  }
  return [...vistos.values()].slice(0, 5);
}

const RESUMO_EMAIL = [
  "razao_social",
  "nome_completo",
  "nome_fantasia",
  "numero_funcionarios",
  "regime_tributario",
  "cidade",
  "estado",
  "contato_pessoa",
  "contato_email",
  "nfe_emails",
  "ordem_compra_obrigatoria",
  "forma_pagamento",
  "politica_pagamento",
  "observacoes",
];

/** Sino + e-mail para o vendedor: ficha recebida, se bateu com empresa, e o pedido de confirmação. */
async function avisarVendedor(a: {
  vendedorId: string;
  fichaId: string;
  nome: string;
  tipo: string;
  documento: string | null;
  dados: Record<string, string>;
  empresa: { id: string; uid: string; nome: string } | null;
  sugestoes: Array<{ nome: string; cnpj: string | null }>;
}) {
  const link = `/propostas?aba=fichas&ficha=${a.fichaId}`;
  const situacao = a.empresa
    ? `Ligada pelo CNPJ à empresa ${a.empresa.nome}. Confira os dados e confirme.`
    : a.sugestoes.length
      ? `O ${a.tipo} não bateu com nenhuma empresa. Parecidas: ${a.sugestoes.map((s) => s.nome).join(", ")}. Confirme o vínculo.`
      : `${a.tipo} ${formatarDocumento(a.documento)} ainda não tem empresa no Compass. Cadastre a empresa ou vincule a ficha.`;
  await db()
    .from("notificacoes")
    .insert({
      user_id: a.vendedorId,
      tipo: "ficha",
      titulo: `Ficha cadastral recebida: ${a.nome}`.slice(0, 200),
      corpo: situacao.slice(0, 2000),
      link,
    })
    .then(
      () => undefined,
      () => undefined,
    );

  const rotulo = new Map(CAMPOS_FICHA.map((c) => [c.chave, c.rotulo]));
  const linhas = RESUMO_EMAIL.filter((k) => a.dados[k])
    .map(
      (k) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(rotulo.get(k) ?? k)}</td><td style="padding:4px 0;">${esc(a.dados[k])}</td></tr>`,
    )
    .join("");
  const para = await emailsDosUsuarios([a.vendedorId]);
  await enviarEmailInterno({
    para,
    assunto: `Ficha cadastral recebida: ${a.nome}${a.empresa ? "" : " (confirmar empresa)"}`,
    titulo: `Ficha cadastral de ${a.nome}`,
    corpoHtml: `
      <p style="margin:0 0 4px 0;color:#6b7280;">${esc(a.tipo)} ${esc(formatarDocumento(a.documento))}</p>
      <p style="margin:0 0 16px 0;padding:10px 12px;border-radius:8px;background:${a.empresa ? "#ecfdf5" : "#fffbeb"};">${esc(situacao)}</p>
      <table style="border-collapse:collapse;font-size:13px;">${linhas}</table>
      <p style="margin:16px 0 0 0;color:#6b7280;font-size:12px;">As regras de faturamento da ficha (OC, forma e prazo de pagamento, e-mails da NF) já entram na política do cliente quando ela estiver ligada à empresa; o ADM só confere.</p>`,
    link,
    botao: "Confirmar dados no Compass",
  });
}
