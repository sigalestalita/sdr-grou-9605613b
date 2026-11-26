import { describe, expect, it } from "vitest";
import {
  agruparPorSecao,
  montarApresentacao,
  secoesDasPaginas,
  sugerirProgramas,
  type SlideDoAcervo,
} from "./acervo";
import { MAPA_DA_APRESENTACAO, SECOES_DA_APRESENTACAO } from "./apresentacao-grou";

const s = (ordem: number, programa: string, secao: string, ativo = true): SlideDoAcervo => ({
  id: `s${ordem}`,
  ordem,
  programa,
  secao,
  titulo: null,
  imagemUrl: `https://x.supabase.co/storage/v1/object/public/propostas-slides/acervo/1/${ordem}.webp`,
  ativo,
});

const acervo = [
  s(3, "pda", "PDA Assessment"),
  s(1, "grou", "A Grou"),
  s(2, "grou", "A Grou"),
  s(4, "pda", "PDA Assessment", false),
  s(5, "qr", "Questionário de Resiliência"),
];

describe("agruparPorSecao", () => {
  it("agrupa na ordem da apresentação", () => {
    const g = agruparPorSecao(acervo);
    expect(g.map((x) => x.programa)).toEqual(["grou", "pda", "qr"]);
    expect(g[0].slides.map((x) => x.ordem)).toEqual([1, 2]);
  });
});

describe("sugerirProgramas", () => {
  it("abre com o institucional e acha o serviço pelo nome do item", () => {
    expect(
      sugerirProgramas(
        ["Questionário de Resiliência — 50 respondentes", "Dilemas de Gestão"],
        SECOES_DA_APRESENTACAO,
      ),
    ).toEqual(["grou", "qr", "dg"]);
  });

  it("licença PDA puxa o PDA Assessment; treinamento com PDA no nome puxa só o treinamento", () => {
    expect(sugerirProgramas(["Licença PDA 200 créditos"], SECOES_DA_APRESENTACAO)).toEqual([
      "grou",
      "pda",
    ]);
    expect(
      sugerirProgramas(["Capacitação Analista Comportamental PDA"], SECOES_DA_APRESENTACAO),
    ).toEqual(["grou", "capacitacao-pda"]);
  });

  it("sem item conhecido, só o institucional", () => {
    expect(sugerirProgramas(["Consultoria sob medida X"], SECOES_DA_APRESENTACAO)).toEqual([
      "grou",
    ]);
  });
});

describe("montarApresentacao", () => {
  it("só os escolhidos e ativos, na ordem, com título pelas seções", () => {
    const ap = montarApresentacao(acervo, new Set(["s5", "s1", "s3", "s4"]));
    expect(ap.slides.map((u) => u.split("/").pop())).toEqual(["1.webp", "3.webp", "5.webp"]);
    expect(ap.titulo).toBe("Grou · PDA Assessment, Questionário de Resiliência");
    expect(ap.fonte).toBe("acervo");
  });
});

describe("secoesDasPaginas", () => {
  it("com o mesmo número de páginas, usa o mapa", () => {
    const p = secoesDasPaginas(MAPA_DA_APRESENTACAO.length);
    expect(p[0]).toMatchObject({ programa: "grou", secao: "A Grou", mapeado: true });
    expect(p[p.length - 1].programa).toBe("groutalent");
  });

  it("com outro número de páginas, tudo sem seção", () => {
    expect(secoesDasPaginas(10).every((x) => x.programa === "sem-secao" && !x.mapeado)).toBe(true);
  });
});
