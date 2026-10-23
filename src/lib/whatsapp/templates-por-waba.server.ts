import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { wabaDe } from "./conta-da-dona";

/*
 * Template mora no WABA.
 *
 * Os templates aprovados do Compass estão no WABA da Grou. Na coexistência
 * cada SDR fica no WABA que já era do app dela, então para a primeira
 * mensagem, a passagem para consultoria ou uma campanha sair pelo número
 * dela, o mesmo template (mesmo nome, mesmo texto) precisa estar aprovado lá
 * também. Este módulo copia e confere.
 */

type Admin = SupabaseClient<Database>;

const GRAPH = "https://graph.facebook.com/v21.0";

type ContaGraph = {
  id: string;
  access_token: string | null;
  provider_base_url?: string | null;
  metadata: unknown;
};

type TemplateDaMeta = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: Array<Record<string, unknown>>;
};

const base = (c: ContaGraph) => (c.provider_base_url || GRAPH).replace(/\/+$/, "");

async function graph<T>(conta: ContaGraph, caminho: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base(conta)}/${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${conta.access_token ?? ""}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(texto);
  } catch {
    /* texto cru vai no erro */
  }
  if (!res.ok) {
    const erro = json.error as { error_user_msg?: string; message?: string } | undefined;
    throw new Error(
      erro?.error_user_msg || erro?.message || `Meta ${res.status}: ${texto.slice(0, 200)}`,
    );
  }
  return json as T;
}

/*
 * Lista de templates do WABA, guardada por alguns minutos.
 *
 * Uma campanha confere o mesmo template para centenas de leads da mesma SDR;
 * perguntar à Meta a cada um seria lento e gastaria limite de chamada.
 */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { em: number; templates: TemplateDaMeta[] }>();

async function templatesDoWaba(conta: ContaGraph, fresco = false): Promise<TemplateDaMeta[]> {
  const waba = wabaDe(conta);
  if (!waba || !conta.access_token) return [];
  const guardado = cache.get(waba);
  if (!fresco && guardado && Date.now() - guardado.em < CACHE_MS) return guardado.templates;
  const r = await graph<{ data?: TemplateDaMeta[] }>(
    conta,
    `${encodeURIComponent(waba)}/message_templates?fields=id,name,language,status,category&limit=250`,
  );
  const templates = r.data ?? [];
  cache.set(waba, { em: Date.now(), templates });
  return templates;
}

/**
 * Id do template aprovado no WABA desta conta, ou null.
 *
 * O id é o da cópia, não o da Grou: é por ele que o envio descobre quantas
 * variáveis o template tem, e o token de um WABA não lê template de outro.
 */
export async function templateAprovadoNaConta(
  conta: ContaGraph,
  nome: string,
  idioma = "pt_BR",
): Promise<string | null> {
  try {
    const t = (await templatesDoWaba(conta)).find(
      (x) => x.name === nome && x.language === idioma && x.status === "APPROVED",
    );
    return t?.id ?? null;
  } catch (e) {
    console.warn("[templates por waba] não deu para conferir", nome, e);
    return null;
  }
}

/**
 * Corpo do pedido de criação, a partir do template como a Meta o devolve.
 *
 * Só leva o que a criação aceita: tipo, formato, texto, exemplo e botões.
 * Cabeçalho de mídia fica de fora — a criação exige um arquivo enviado ao
 * WABA de destino, e os templates de disparo do Compass não usam.
 */
export function montarCopia(t: TemplateDaMeta) {
  const components = (t.components ?? []).map((c) => {
    const tipo = String(c.type ?? "").toUpperCase();
    const comp: Record<string, unknown> = { type: tipo };
    for (const chave of ["format", "text", "example", "buttons"]) {
      if (c[chave] !== undefined) comp[chave] = c[chave];
    }
    return comp;
  });
  const temMidia = components.some(
    (c) => c.type === "HEADER" && ["IMAGE", "VIDEO", "DOCUMENT"].includes(String(c.format ?? "")),
  );
  return {
    temMidia,
    pedido: {
      name: t.name,
      language: t.language,
      category: String(t.category ?? "MARKETING").toUpperCase(),
      components,
    },
  };
}

/** Templates que os disparos automáticos usam: a base de qualquer número de SDR. */
async function templatesDaBase(admin: Admin): Promise<string[]> {
  const { data: cfg } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "whatsapp_ai_agent")
    .maybeSingle();
  const v = (cfg?.value ?? {}) as Record<string, unknown>;
  const ids = ["initialTemplateId", "consultoriaInitialTemplateId", "consultoriaPassagemTemplateId"]
    .map((k) => v[k])
    .filter((x): x is string => typeof x === "string" && !!x);
  const { TEMPLATES_DO_SISTEMA } = await import("./templates-do-sistema");
  const nomesDoSistema = TEMPLATES_DO_SISTEMA.map((t) => t.provider_template_name);
  const { data } = await admin
    .from("whatsapp_templates")
    .select("id, provider_template_name, status")
    .eq("status", "approved");
  return (data ?? [])
    .filter(
      (t) =>
        !!t.provider_template_name &&
        (ids.includes(t.id) || nomesDoSistema.includes(t.provider_template_name)),
    )
    .map((t) => t.id);
}

export type ResultadoDaCopia = { template: string; resultado: string };

/**
 * Envia para aprovação, no WABA da conta, os templates aprovados da Grou.
 *
 * Sem `templateIds`, copia a base (primeira mensagem, passagem para
 * consultoria e os templates do sistema). Template que já existe lá com o
 * mesmo nome não é enviado de novo. O resultado fica na conta, para a tela
 * mostrar o que foi pedido e o que deu erro.
 */
export async function copiarTemplatesParaConta(
  admin: Admin,
  contaId: string,
  templateIds?: string[],
): Promise<ResultadoDaCopia[]> {
  const [{ data: destino }, { data: padrao }] = await Promise.all([
    admin.from("whatsapp_accounts").select("*").eq("id", contaId).maybeSingle(),
    admin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle(),
  ]);
  if (!destino) throw new Error("Conta não encontrada");
  if (!padrao) throw new Error("Sem conta padrão para ler os templates");
  const wabaDestino = wabaDe(destino);
  if (!wabaDestino || !destino.access_token) throw new Error("Conta sem WABA ID ou sem token");
  if (wabaDestino === wabaDe(padrao)) return [];

  const ids = templateIds?.length ? templateIds : await templatesDaBase(admin);
  const { data: rows } = await admin
    .from("whatsapp_templates")
    .select("id, name, provider_template_name, meta_template_id, language")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const existentes = await templatesDoWaba(destino, true);

  const resultados: ResultadoDaCopia[] = [];
  for (const row of rows ?? []) {
    const nome = row.provider_template_name ?? "";
    if (!nome || !row.meta_template_id) {
      resultados.push({ template: row.name ?? nome, resultado: "sem registro na Meta" });
      continue;
    }
    const ja = existentes.find((t) => t.name === nome && t.language === (row.language ?? "pt_BR"));
    if (ja) {
      resultados.push({ template: nome, resultado: `já existe (${ja.status})` });
      continue;
    }
    try {
      const original = await graph<TemplateDaMeta>(
        padrao,
        `${encodeURIComponent(row.meta_template_id)}?fields=name,language,status,category,components`,
      );
      const { temMidia, pedido } = montarCopia(original);
      if (temMidia) {
        resultados.push({ template: nome, resultado: "tem imagem no topo: copie à mão" });
        continue;
      }
      const criado = await graph<{ status?: string }>(
        destino,
        `${encodeURIComponent(wabaDestino)}/message_templates`,
        { method: "POST", body: JSON.stringify(pedido) },
      );
      resultados.push({ template: nome, resultado: `enviado (${criado.status ?? "PENDING"})` });
    } catch (e) {
      resultados.push({
        template: nome,
        resultado: `erro: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  cache.delete(wabaDestino);

  await admin
    .from("whatsapp_accounts")
    .update({
      metadata: {
        ...((destino.metadata as Record<string, unknown>) ?? {}),
        templates_copiados: { em: new Date().toISOString(), resultados },
      },
    } as never)
    .eq("id", contaId);
  return resultados;
}

/**
 * Esta conta pode mandar este template? Devolve o id do template no WABA
 * dela (o que o envio usa para contar variáveis), ou null se lá ele ainda não
 * está aprovado — aí quem chamou manda pela conta de sempre.
 *
 * Conta no WABA da Grou, ou sem WABA cadastrado, usa o template como está.
 */
export async function templateNaConta(
  admin: Admin,
  conta: ContaGraph,
  tmpl: {
    provider_template_name: string | null;
    language: string | null;
    meta_template_id: string | null;
  },
): Promise<{ metaTemplateId: string | null } | null> {
  const waba = wabaDe(conta);
  if (!waba) return { metaTemplateId: tmpl.meta_template_id };
  const { data: padrao } = await admin
    .from("whatsapp_accounts")
    .select("metadata")
    .eq("is_default", true)
    .maybeSingle();
  if (waba === wabaDe(padrao as { metadata: unknown } | null)) {
    return { metaTemplateId: tmpl.meta_template_id };
  }
  if (!tmpl.provider_template_name) return null;
  const id = await templateAprovadoNaConta(
    conta,
    tmpl.provider_template_name,
    tmpl.language ?? "pt_BR",
  );
  return id ? { metaTemplateId: id } : null;
}
