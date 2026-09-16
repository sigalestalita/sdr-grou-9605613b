/*
 * Leitor de CSV em fluxo.
 *
 * O export do RD voltou com 127 MB. Ler tudo de uma vez e virar array de
 * objetos estoura a memória da aba muito antes de a importação começar: cada
 * linha vira um objeto com dezenas de campos, e são 70 mil delas.
 *
 * Aqui o arquivo é consumido em pedaços. O leitor guarda o que sobrou do
 * pedaço anterior e o estado das aspas, porque um campo com vírgula ou quebra
 * de linha dentro pode atravessar a fronteira do pedaço — que é exatamente o
 * caso de "Rua X, 123" e de campo de texto longo.
 */

export type LeitorCsv = {
  /** Consome um pedaço e devolve as linhas completas que ele fechou. */
  alimentar: (pedaco: string) => string[][];
  /** Fecha o arquivo e devolve a última linha, se o texto não terminou em quebra. */
  finalizar: () => string[][];
};

export function criarLeitorCsv(separador: string): LeitorCsv {
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  let anteriorEraAspaDentro = false;

  function consumir(texto: string): string[][] {
    const linhas: string[][] = [];
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];

      if (anteriorEraAspaDentro) {
        anteriorEraAspaDentro = false;
        if (c === '"') {
          // Aspa escapada: "" vira uma aspa literal.
          campo += '"';
          continue;
        }
        aspas = false;
        // Sem `continue`: o caractere atual ainda precisa ser processado fora das aspas.
      }

      if (aspas) {
        if (c === '"') anteriorEraAspaDentro = true;
        else campo += c;
        continue;
      }

      if (c === '"') {
        aspas = true;
      } else if (c === separador) {
        linha.push(campo);
        campo = "";
      } else if (c === "\n") {
        linha.push(campo.replace(/\r$/, ""));
        if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
        linha = [];
        campo = "";
      } else {
        campo += c;
      }
    }
    return linhas;
  }

  return {
    alimentar: consumir,
    finalizar() {
      // Uma aspa pendente no fim do arquivo fecha o campo em vez de perdê-lo.
      anteriorEraAspaDentro = false;
      aspas = false;
      if (campo !== "" || linha.length > 0) {
        linha.push(campo.replace(/\r$/, ""));
        campo = "";
        const fechada = linha;
        linha = [];
        if (fechada.some((x) => x.trim() !== "")) return [fechada];
      }
      return [];
    },
  };
}

/** Descobre o separador olhando o cabeçalho: o RD alterna entre vírgula e ponto e vírgula. */
export function descobrirSeparador(primeiraLinha: string): string {
  const pv = (primeiraLinha.match(/;/g) ?? []).length;
  const v = (primeiraLinha.match(/,/g) ?? []).length;
  return pv > v ? ";" : ",";
}
