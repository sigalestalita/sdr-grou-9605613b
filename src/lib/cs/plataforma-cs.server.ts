import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIAS_USO,
  ligarUsuario,
  maisRecente,
  montarIndices,
  normalizarEmail,
} from "@/lib/cs/plataforma-cs";

/*
 * Lê o uso da Plataforma de Sucesso do Cliente (outro Supabase) e grava em
 * cs_plataforma_uso, uma linha por empresa e e-mail. Só lê da plataforma:
 * login dos usuários (auth admin) e conclusões de aula e módulo dos últimos
 * 90 dias. A chave fica nos segredos do Compass: PLATAFORMA_CS_SERVICE_ROLE_KEY.
 */
const URL_PADRAO = "https://hapzzpwywnahovmddlej.supabase.co";
const PAGINA = 1000;

type Env = Record<string, string | undefined>;

function config(env: Env) {
  const chave = env["PLATAFORMA_CS_SERVICE_ROLE_KEY"];
  if (!chave) throw new Error("PLATAFORMA_CS_SERVICE_ROLE_KEY não configurada nos segredos");
  const url = (env["PLATAFORMA_CS_URL"] || URL_PADRAO).replace(/\/+$/, "");
  return { url, headers: { apikey: chave, Authorization: `Bearer ${chave}` } };
}

type Usuario = { id: string; email: string; nome: string | null; ultimoLogin: string | null };

async function listarUsuarios(c: ReturnType<typeof config>, f: typeof fetch): Promise<Usuario[]> {
  const out: Usuario[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await f(`${c.url}/auth/v1/admin/users?page=${page}&per_page=${PAGINA}`, {
      headers: c.headers,
    });
    if (!res.ok)
      throw new Error(`plataforma auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as {
      users?: Array<{
        id: string;
        email?: string | null;
        last_sign_in_at?: string | null;
        user_metadata?: { full_name?: string; name?: string } | null;
      }>;
    };
    const lote = body.users ?? [];
    for (const u of lote) {
      if (!u.email) continue;
      out.push({
        id: u.id,
        email: normalizarEmail(u.email),
        nome: u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
        ultimoLogin: u.last_sign_in_at ?? null,
      });
    }
    if (lote.length < PAGINA) break;
  }
  return out;
}

/** Conclusões (user_id, completed_at) de uma tabela, desde `desde`, página a página. */
async function conclusoes(
  c: ReturnType<typeof config>,
  f: typeof fetch,
  tabela: string,
  desde: string,
  filtroExtra = "",
): Promise<Array<{ user_id: string; completed_at: string }>> {
  const out: Array<{ user_id: string; completed_at: string }> = [];
  for (let de = 0; de < 200_000; de += PAGINA) {
    const res = await f(
      `${c.url}/rest/v1/${tabela}?select=user_id,completed_at&completed_at=gte.${encodeURIComponent(desde)}${filtroExtra}&order=completed_at.asc`,
      { headers: { ...c.headers, Range: `${de}-${de + PAGINA - 1}` } },
    );
    if (!res.ok) {
      // tabela que não existe mais na plataforma não derruba o resto
      if (res.status === 404) return out;
      throw new Error(`plataforma ${tabela} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const lote = (await res.json()) as Array<{ user_id: string; completed_at: string }>;
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

export async function sincronizarPlataformaCs(
  db: SupabaseClient,
  deps: { env?: Env; fetch?: typeof fetch } = {},
): Promise<{ usuarios: number; ligados: number; empresas: number; comUso: number }> {
  const c = config(deps.env ?? process.env);
  const f = deps.fetch ?? fetch;
  const desde = new Date(Date.now() - DIAS_USO * 86400000).toISOString();

  const [usuarios, aulas, modulos, modulosPrograma] = await Promise.all([
    listarUsuarios(c, f),
    conclusoes(c, f, "academy_lesson_progress", desde),
    conclusoes(c, f, "user_progress", desde, "&completed=is.true"),
    conclusoes(c, f, "program_module_progress", desde),
  ]);

  const contar = (rows: Array<{ user_id: string; completed_at: string }>) => {
    const m = new Map<string, { n: number; ultima: string | null }>();
    for (const r of rows) {
      const a = m.get(r.user_id) ?? { n: 0, ultima: null };
      a.n++;
      a.ultima = maisRecente(a.ultima, r.completed_at);
      m.set(r.user_id, a);
    }
    return m;
  };
  const aulasDe = contar(aulas);
  const modulosDe = contar([...modulos, ...modulosPrograma]);

  // contatos do Compass com e-mail
  const contatos: Array<{ client_uid: string; email: string | null }> = [];
  for (let de = 0; de < 100_000; de += PAGINA) {
    const { data, error } = await db
      .from("cs_contacts")
      .select("client_uid, email")
      .not("email", "is", null)
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    contatos.push(...((data ?? []) as typeof contatos));
    if ((data ?? []).length < PAGINA) break;
  }
  const idx = montarIndices(contatos.map((k) => ({ clientUid: k.client_uid, email: k.email })));

  const agora = new Date().toISOString();
  const linhas = new Map<string, Record<string, unknown>>();
  for (const u of usuarios) {
    const a = aulasDe.get(u.id);
    const m = modulosDe.get(u.id);
    for (const l of ligarUsuario(u.email, idx)) {
      linhas.set(`${l.clientUid}|${u.email}`, {
        client_uid: l.clientUid,
        email: u.email,
        nome: u.nome,
        ligado_por: l.ligadoPor,
        ultimo_acesso: u.ultimoLogin,
        aulas_90d: a?.n ?? 0,
        modulos_90d: m?.n ?? 0,
        ultima_atividade: maisRecente(u.ultimoLogin, a?.ultima, m?.ultima),
        atualizado_em: agora,
      });
    }
  }

  const rows = [...linhas.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("cs_plataforma_uso")
      .upsert(rows.slice(i, i + 500) as never, { onConflict: "client_uid,email" });
    if (error) throw new Error(error.message);
  }
  // quem saiu da plataforma (ou deixou de bater com um contato) sai daqui
  await db.from("cs_plataforma_uso").delete().lt("atualizado_em", agora);

  const empresas = new Set(rows.map((r) => r.client_uid as string));
  const comUso = new Set(
    rows
      .filter((r) => {
        const d = r.ultima_atividade as string | null;
        return !!d && new Date(d).toISOString() >= desde;
      })
      .map((r) => r.client_uid as string),
  );
  return {
    usuarios: usuarios.length,
    ligados: rows.length,
    empresas: empresas.size,
    comUso: comUso.size,
  };
}
