/*
 * O PostgREST do Supabase devolve no máximo 1.000 linhas por pedido (max_rows),
 * sem erro: um relatório de ano inteiro saía somado pela metade. Estes
 * auxiliares buscam página a página, e quebram listas grandes de ids em lotes
 * para a URL do .in() não estourar.
 */
type Resposta = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

const PAGINA = 1000;

/** Busca todas as páginas. `consulta(de, ate)` deve aplicar .range(de, ate) e uma ordenação estável. */
export async function todasAsPaginas<T>(
  consulta: (de: number, ate: number) => Resposta,
  maximo = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < maximo; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < PAGINA) break;
  }
  return out;
}

/** Roda `consulta` em lotes de ids (padrão 150 uuids por pedido) e junta o resultado. */
export async function emLotes<T>(
  ids: string[],
  consulta: (lote: string[]) => Resposta,
  tamanho = 150,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += tamanho) {
    const { data, error } = await consulta(ids.slice(i, i + tamanho));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}
