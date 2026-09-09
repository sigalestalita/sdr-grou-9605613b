/*
 * Orquestra o espelho do RD e a transformação da onda 2 em fatias, a partir do
 * navegador. Cada chamada ao servidor é curta o bastante para o limite do
 * worker/sandbox; o laço aqui encadeia as centenas de chamadas. As funções
 * recebem as chamadas como parâmetro para poderem ser testadas sem servidor.
 */

export type MirrorCounts = { organizations: number; contacts: number; deals: number };
export type MirrorSliceOut = {
  saved: number;
  total: number | null;
  hasMore: boolean;
  nextPage?: string | null;
  lastPage?: number;
};
export type MirrorCall = (body: Record<string, unknown>) => Promise<{
  counts?: MirrorCounts;
  saved?: number;
  total?: number | null;
  hasMore?: boolean;
  nextPage?: string | null;
  lastPage?: number;
}>;

export type TransformPart = Record<string, number>;
export type TransformSlice = {
  companies: TransformPart;
  contacts: TransformPart;
  deals: TransformPart;
  dedupe: TransformPart;
  products: number;
  errors: string[];
};
export type TransformCall = (body: {
  dryRun: boolean;
  only: Array<"companies" | "contacts" | "deals" | "parents">;
  offset?: number;
  limit?: number;
}) => Promise<TransformSlice>;

export const MIRROR_PASSES: Array<[string, string]> = [
  ["created_at", "asc"],
  ["created_at", "desc"],
  ["name", "asc"],
  ["name", "desc"],
  ["updated_at", "asc"],
  ["updated_at", "desc"],
];
export const MIRROR_WINDOW = 2; // páginas por chamada (≈400 registros)
export const CONTACT_BUCKETS = "bcdfghjklmnpqrstvwxyz";
export const TRANSFORM_LIMITS = { companies: 1000, contacts: 1500, deals: 800 } as const;

export class Aborted extends Error {
  constructor() {
    super("Interrompido");
  }
}

async function retry<T>(fn: () => Promise<T>, tries = 5, log?: (s: string) => void): Promise<T> {
  let last: unknown;
  for (let a = 1; a <= tries; a++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      log?.(`  falhou (${a}/${tries}): ${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, 3000 * a));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** RD → rd_organizations / rd_contacts / rd_deals. Para quando o staging alcança o total do RD. */
export async function driveMirror(
  call: MirrorCall,
  log: (line: string) => void,
  signal?: AbortSignal,
): Promise<MirrorCounts> {
  const check = () => {
    if (signal?.aborted) throw new Aborted();
  };
  const counts = async () => (await retry(() => call({ counts: true }), 5, log)).counts!;
  const before = await counts();
  log(
    `antes: ${before.organizations} empresas · ${before.contacts} contatos · ${before.deals} negócios`,
  );

  for (const resource of ["organizations", "contacts"] as const) {
    let total: number | null = null;
    const have = async () => (await counts())[resource];
    const sweep = async (base: Record<string, string>, label: string) => {
      for (let from = 1; from <= 50; from += MIRROR_WINDOW) {
        check();
        const r = await retry(
          () => call({ resource, ...base, from, to: from + MIRROR_WINDOW - 1 }),
          5,
          log,
        );
        total = r.total ?? total;
        log(`${resource} ${label} p${from}-${r.lastPage ?? from}: +${r.saved ?? 0}`);
        if (!r.hasMore) break;
      }
      const n = await have();
      log(`${resource}: ${n}/${total ?? "?"} no staging`);
      return total !== null && n >= total;
    };
    let done = false;
    for (const [order, direction] of MIRROR_PASSES) {
      if (await sweep({ order, direction }, `${order}/${direction}`)) {
        done = true;
        break;
      }
    }
    if (!done && resource === "contacts") {
      for (const q of CONTACT_BUCKETS) if (await sweep({ q }, `q=${q}`)) break;
    }
  }

  let next: string | null = null;
  let done = 0;
  for (let i = 0; i < 500; i++) {
    check();
    const r = await retry(() => call({ resource: "deals", next, pages: MIRROR_WINDOW }), 5, log);
    done += r.saved ?? 0;
    log(`negócios +${r.saved ?? 0} (${done}/${r.total ?? "?"})`);
    if (!r.hasMore) break;
    next = r.nextPage ?? null;
  }

  const after = await counts();
  log(
    `depois: ${after.organizations} empresas · ${after.contacts} contatos · ${after.deals} negócios`,
  );
  return after;
}

/** Staging → Empresas/Contatos/Negócios, em fatias por recurso. Soma os resultados. */
export async function driveTransform(
  call: TransformCall,
  counts: MirrorCounts,
  dryRun: boolean,
  log: (line: string) => void,
  signal?: AbortSignal,
): Promise<TransformSlice & { dryRun: boolean }> {
  const agg: TransformSlice = {
    companies: {},
    contacts: {},
    deals: {},
    dedupe: {},
    products: 0,
    errors: [],
  };
  const add = (k: "companies" | "contacts" | "deals" | "dedupe", part?: TransformPart) => {
    for (const [f, v] of Object.entries(part ?? {})) agg[k][f] = (agg[k][f] ?? 0) + Number(v);
  };
  const run = async (only: "companies" | "contacts" | "deals", total: number) => {
    const limit = TRANSFORM_LIMITS[only];
    for (let offset = 0; offset < total; offset += limit) {
      if (signal?.aborted) throw new Aborted();
      const r = await retry(() => call({ dryRun, only: [only], offset, limit }), 5, log);
      add(only, r[only]);
      agg.products = Math.max(agg.products, r.products ?? 0);
      agg.errors.push(...(r.errors ?? []));
      const p = r[only] ?? {};
      log(
        `${only} ${Math.min(offset + limit, total)}/${total}: ${p.created ?? 0} novos · ${p.updated ?? 0} atualizados${r.errors?.length ? ` · erro: ${r.errors[0]}` : ""}`,
      );
    }
  };
  await run("companies", counts.organizations);
  await run("contacts", counts.contacts);
  await run("deals", counts.deals);
  if (!dryRun) {
    const r = await retry(() => call({ dryRun, only: ["parents"] }), 5, log);
    add("dedupe", r.dedupe);
    log(`mãe → filha: ${r.dedupe?.parent ?? 0} sugestões · ${r.dedupe?.company ?? 0} duplicatas`);
  }
  agg.errors = [...new Set(agg.errors)].slice(0, 20);
  return { ...agg, dryRun };
}
