import { describe, expect, it } from "vitest";
import {
  MANUAL_SDR_URL,
  MANUAL_CS_URL,
  manuaisDaPessoa,
  montarHtmlBoasVindas,
  rascunhoBoasVindas,
} from "./boas-vindas";
import type { Team } from "./teams";

const time = (slug: string, nome: string, modulo: Team["modulo"]): Team => ({
  slug,
  nome,
  descricao: null,
  modulo,
  cor: "slate",
  ativo: true,
  ordem: 1,
});
const TEAMS = [
  time("comercial", "Comercial", "comercial"),
  time("cs", "Customer Success", "cs"),
  time("adm", "Administrativo", "administrativo"),
];

describe("manuaisDaPessoa", () => {
  it("dá o manual do time da pessoa", () => {
    expect(
      manuaisDaPessoa([{ team: "comercial", access: ["sdr"] }], TEAMS).map((m) => m.url),
    ).toEqual([MANUAL_SDR_URL]);
    expect(
      manuaisDaPessoa([{ team: "cs", access: ["analista"] }], TEAMS).map((m) => m.url),
    ).toEqual([MANUAL_CS_URL]);
  });

  it("gestão, os dois times ou nenhum deles: os dois manuais", () => {
    for (const ms of [
      [{ team: "comercial", access: ["gestao"] }],
      [
        { team: "comercial", access: ["executivo"] },
        { team: "cs", access: ["analista"] },
      ],
      [{ team: "adm", access: ["faturamento"] }],
      [],
    ])
      expect(manuaisDaPessoa(ms, TEAMS)).toHaveLength(2);
  });
});

describe("rascunhoBoasVindas", () => {
  const base = {
    nome: "Maria Souza",
    email: "maria@grougp.com.br",
    memberships: [{ team: "cs", access: ["analista"] }],
    teams: TEAMS,
    remetente: "Talita",
  };

  it("cumprimenta pelo primeiro nome, cita o acesso, o time, o manual e assina", () => {
    const { assunto, corpo } = rascunhoBoasVindas({ ...base, comLinkDeSenha: true });
    expect(assunto).toContain("Compass");
    expect(corpo).toMatch(/^Olá, Maria!/);
    expect(corpo).toContain("Seu acesso: maria@grougp.com.br");
    expect(corpo).toContain("Seu time: Customer Success");
    expect(corpo).toContain("https://compass.grougp.com/manual. Ele mostra");
    expect(corpo).toContain(`Módulo CS: ${MANUAL_CS_URL}`);
    expect(corpo).not.toContain(MANUAL_SDR_URL);
    expect(corpo).toContain("Definir minha senha");
    expect(corpo.trim().endsWith("Talita")).toBe(true);
  });

  it("com senha já definida, manda entrar em compass.grougp.com", () => {
    const { corpo } = rascunhoBoasVindas({ ...base, comLinkDeSenha: false, remetente: null });
    expect(corpo).not.toContain("Definir minha senha");
    expect(corpo).toContain("Entre em https://compass.grougp.com");
    expect(corpo.trim().endsWith("Equipe Grou")).toBe(true);
  });
});

describe("montarHtmlBoasVindas", () => {
  it("escapa o texto, liga as URLs e põe o botão", () => {
    const { html, texto } = montarHtmlBoasVindas(
      `Oi <b>x</b> & cia\n   • Manual: ${MANUAL_CS_URL}.\n\nFim`,
      {
        texto: "Definir minha senha",
        url: "https://exemplo.supabase.co/verify?token=a&type=recovery",
      },
    );
    expect(html).toContain("Oi &lt;b&gt;x&lt;/b&gt; &amp; cia");
    expect(html).toContain(`<a href="${MANUAL_CS_URL}"`);
    expect(html).toContain(`${MANUAL_CS_URL}</a>.`);
    expect(html).toContain("&nbsp;&nbsp;&nbsp;• Manual");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain('href="https://exemplo.supabase.co/verify?token=a&amp;type=recovery"');
    expect(html).not.toContain("<b>x</b>");
    expect(texto).toContain("Definir minha senha: https://exemplo.supabase.co/verify");
  });
});
