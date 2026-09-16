import { describe, expect, it } from "vitest";
import { criarLeitorCsv, descobrirSeparador } from "./csv-stream";

function lerTudo(texto: string, sep = ",", tamanhoDoPedaco = 7): string[][] {
  const leitor = criarLeitorCsv(sep);
  const linhas: string[][] = [];
  for (let i = 0; i < texto.length; i += tamanhoDoPedaco) {
    linhas.push(...leitor.alimentar(texto.slice(i, i + tamanhoDoPedaco)));
  }
  linhas.push(...leitor.finalizar());
  return linhas;
}

describe("criarLeitorCsv", () => {
  it("lê o mesmo resultado independente de onde o pedaço corta", () => {
    const csv = "nome,email\nAna,ana@x.com\nBruno,bruno@y.com\n";
    const esperado = [
      ["nome", "email"],
      ["Ana", "ana@x.com"],
      ["Bruno", "bruno@y.com"],
    ];
    // 1 byte por vez é o pior caso: toda fronteira cai no meio de um campo.
    for (const tamanho of [1, 3, 7, 50, 10_000]) {
      expect({ tamanho, linhas: lerTudo(csv, ",", tamanho) }).toEqual({
        tamanho,
        linhas: esperado,
      });
    }
  });

  it("respeita vírgula dentro de aspas", () => {
    const csv = 'nome,endereco\n"Ana","Rua X, 123"\n';
    expect(lerTudo(csv)).toEqual([
      ["nome", "endereco"],
      ["Ana", "Rua X, 123"],
    ]);
  });

  it("respeita quebra de linha dentro de aspas", () => {
    const csv = 'nome,obs\n"Ana","linha 1\nlinha 2"\n';
    expect(lerTudo(csv)).toEqual([
      ["nome", "obs"],
      ["Ana", "linha 1\nlinha 2"],
    ]);
  });

  it("entende aspa escapada", () => {
    const csv = 'nome\n"Ana ""a Grande"""\n';
    expect(lerTudo(csv)).toEqual([["nome"], ['Ana "a Grande"']]);
  });

  it("fecha a última linha quando o arquivo não termina em quebra", () => {
    expect(lerTudo("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("aceita ponto e vírgula", () => {
    expect(lerTudo("a;b\n1;2\n", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("descarta linha em branco", () => {
    expect(lerTudo("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("descobrirSeparador", () => {
  it("escolhe pelo que aparece mais no cabeçalho", () => {
    expect(descobrirSeparador("nome;email;telefone")).toBe(";");
    expect(descobrirSeparador("nome,email,telefone")).toBe(",");
  });
});
