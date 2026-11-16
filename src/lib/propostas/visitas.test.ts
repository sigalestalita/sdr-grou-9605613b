import { describe, expect, it } from "vitest";
import {
  chegouAoFimAgora,
  dispositivo,
  ehRetorno,
  mesclarSlides,
  resumirVisitas,
  somarSegundos,
} from "./visitas";

describe("voltou a abrir (mais de 6 horas)", () => {
  const agora = new Date("2026-11-16T18:00:00Z");
  it("avisa quando a última atividade foi há mais de 6 horas", () => {
    expect(ehRetorno("2026-11-16T11:59:00Z", agora)).toBe(true);
  });
  it("não avisa com 6 horas ou menos", () => {
    expect(ehRetorno("2026-11-16T12:00:00Z", agora)).toBe(false);
    expect(ehRetorno("2026-11-16T17:00:00Z", agora)).toBe(false);
  });
  it("não avisa na primeira abertura", () => {
    expect(ehRetorno(null, agora)).toBe(false);
  });
});

describe("viu todos os slides", () => {
  it("avisa só na primeira vez que alguém chega ao último", () => {
    expect(chegouAoFimAgora(10, 18, 18)).toBe(true);
    expect(chegouAoFimAgora(18, 18, 18)).toBe(false);
    expect(chegouAoFimAgora(5, 17, 18)).toBe(false);
  });
  it("sem apresentação não avisa", () => {
    expect(chegouAoFimAgora(0, 0, 0)).toBe(false);
  });
});

describe("slides vistos e tempo", () => {
  it("junta sem repetir e ignora números fora da apresentação", () => {
    expect(mesclarSlides([1, 2], [2, 3, 19, 0], 18)).toEqual([1, 2, 3]);
  });
  it("soma o tempo enviado com teto por envio", () => {
    expect(somarSegundos(30, 15)).toBe(45);
    expect(somarSegundos(0, 9999)).toBe(120);
    expect(somarSegundos(10, -5)).toBe(10);
  });
  it("resume as visitas: aberturas, primeira, última, slides e tempo", () => {
    const r = resumirVisitas(
      [
        {
          iniciada_em: "2026-11-10T10:00:00Z",
          ultima_atividade_em: "2026-11-10T10:05:00Z",
          segundos: 300,
          slides_vistos: [1, 2, 3],
          maior_slide: 3,
          user_agent: null,
        },
        {
          iniciada_em: "2026-11-12T09:00:00Z",
          ultima_atividade_em: null,
          segundos: 40,
          slides_vistos: [3, 4],
          maior_slide: 4,
          user_agent: null,
        },
      ],
      18,
    );
    expect(r).toMatchObject({
      aberturas: 2,
      primeira: "2026-11-10T10:00:00Z",
      ultima: "2026-11-12T09:00:00Z",
      segundos: 340,
      slidesVistos: 4,
      maiorSlide: 4,
    });
  });
  it("resume o dispositivo pelo navegador", () => {
    expect(
      dispositivo(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Safari");
    expect(
      dispositivo(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      ),
    ).toBe("Windows · Chrome");
  });
});
