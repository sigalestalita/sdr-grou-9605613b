import { describe, expect, it, vi } from "vitest";
import {
  REMETENTE_AVISOS,
  assuntoDoAviso,
  destinatariosDoAviso,
  lerEmailsDigitados,
  montarEmailDoAviso,
  type DadosDoAviso,
} from "./avisos-email";
import { enviarAvisoPorEmail } from "./avisos-email.server";

const base: Omit<DadosDoAviso, "evento"> = {
  empresa: "Indústria de Peles Minuano",
  numero: 1002,
  versao: 1,
  valor: "R$ 10.000,00",
  dealId: "f9251356-c49e-4dc8-a317-baa7292d6707",
  quando: "2026-11-16T18:30:00.000Z",
  aparelho: "iPhone · Safari",
};

describe("quem recebe o aviso", () => {
  it("usa a lista da proposta quando preenchida", () => {
    expect(destinatariosDoAviso(["Tais.Oliari@grougp.com.br", "mariana@grougp.com.br"], "dono@grougp.com.br")).toEqual([
      "tais.oliari@grougp.com.br",
      "mariana@grougp.com.br",
    ]);
  });
  it("lista vazia: vai para o e-mail de quem enviou", () => {
    expect(destinatariosDoAviso([], "dono@grougp.com.br")).toEqual(["dono@grougp.com.br"]);
  });
  it("lista vazia e dono sem e-mail: ninguém", () => {
    expect(destinatariosDoAviso([], null)).toEqual([]);
  });
  it("aponta os e-mails inválidos digitados", () => {
    expect(lerEmailsDigitados("a@grougp.com.br, errado; b@grougp.com.br a@grougp.com.br")).toEqual({
      validos: ["a@grougp.com.br", "b@grougp.com.br"],
      invalidos: ["errado"],
    });
  });
});

describe("assunto", () => {
  const casos: Array<[DadosDoAviso["evento"], string]> = [
    [{ tipo: "abertura", aberturas: 1, totalSlides: 0 }, "Indústria de Peles Minuano abriu a proposta nº 1002"],
    [
      { tipo: "retorno", aberturas: 2, totalSlides: 0, ultimaAntes: "2026-11-15T10:00:00Z" },
      "Indústria de Peles Minuano voltou a abrir a proposta nº 1002",
    ],
    [
      { tipo: "todos_slides", aberturas: 1, vistos: 18, total: 18, titulo: "" },
      "Indústria de Peles Minuano viu todos os slides da proposta nº 1002",
    ],
    [
      { tipo: "aceite", nome: "Thiago", cargo: "Diretor", email: "t@x.com", documento: null },
      "Proposta nº 1002 ACEITA por Indústria de Peles Minuano",
    ],
    [{ tipo: "recusa", motivo: "" }, "Indústria de Peles Minuano recusou a proposta nº 1002"],
  ];
  it.each(casos)("%o", (evento, esperado) => {
    expect(assuntoDoAviso({ ...base, evento })).toBe(esperado);
  });
});

describe("corpo", () => {
  it("aceite traz nome, cargo, e-mail, documento, valor, hora de Brasília e o link do negócio", () => {
    const { html, texto } = montarEmailDoAviso({
      ...base,
      evento: { tipo: "aceite", nome: "Thiago Enzweiler", cargo: "Diretor", email: "thiago@minuano.com.br", documento: "123.456.789-00" },
    });
    for (const t of ["Thiago Enzweiler", "Diretor", "thiago@minuano.com.br", "123.456.789-00", "R$ 10.000,00", "16/11/2026, 15:30"])
      expect(texto).toContain(t);
    expect(html).toContain("https://compass.grougp.com/negocio/f9251356-c49e-4dc8-a317-baa7292d6707");
    expect(html).toContain("Abrir no Compass");
  });
  it("recusa traz o motivo, e o que o cliente digita não vira HTML", () => {
    const { html, texto } = montarEmailDoAviso({ ...base, evento: { tipo: "recusa", motivo: "<b>caro</b>" } });
    expect(texto).toContain("Motivo: <b>caro</b>");
    expect(html).toContain("&lt;b&gt;caro&lt;/b&gt;");
    expect(html).not.toContain("<b>caro</b>");
  });
  it("todos os slides traz slides vistos e aberturas", () => {
    const { texto } = montarEmailDoAviso({
      ...base,
      evento: { tipo: "todos_slides", aberturas: 3, vistos: 18, total: 18, titulo: "Apresentação Grou" },
    });
    expect(texto).toContain("Slides vistos: 18 de 18");
    expect(texto).toContain("Aberturas até agora: 3");
  });
});

function dbFalso(emailDoDono: string | null = "dono@grougp.com.br") {
  const logs: Array<Record<string, unknown>> = [];
  const db = {
    from(tabela: string) {
      if (tabela === "integration_logs")
        return { insert: async (l: Record<string, unknown>) => (logs.push(l), { error: null }) };
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: emailDoDono } }) }) }),
      };
    },
  };
  return { db: db as never, logs };
}

const proposta = {
  id: "377238f6-8424-4ba8-922c-e2a6cdfb16f9",
  avisos_emails: ["tais.oliari@grougp.com.br", "mariana@grougp.com.br", "talita.sigales@grougp.com.br"],
  enviada_por: null,
  created_by: "u1",
};
const dados: DadosDoAviso = { ...base, evento: { tipo: "abertura", aberturas: 1, totalSlides: 18 } };
const env = { LOVABLE_API_KEY: "l", RESEND_API_KEY: "r" };

describe("envio (simulado, sem e-mail real)", () => {
  it("manda para a lista, com o remetente Compass · Grou, e registra ok", async () => {
    const { db, logs } = dbFalso();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const r = await enviarAvisoPorEmail(proposta, dados, { db, fetch: fetch as never, env });
    expect(r.status).toBe("ok");
    const corpo = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corpo.from).toBe(REMETENTE_AVISOS);
    expect(REMETENTE_AVISOS.startsWith("Compass · Grou <")).toBe(true);
    expect(corpo.to).toEqual(proposta.avisos_emails);
    expect(corpo.subject).toBe("Indústria de Peles Minuano abriu a proposta nº 1002");
    expect(logs[0]).toMatchObject({ provider: "resend", action: "proposta_aviso_email", status: "ok" });
  });
  it("lista vazia: manda só para o e-mail de quem enviou", async () => {
    const { db } = dbFalso("tais.oliari@grougp.com.br");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await enviarAvisoPorEmail({ ...proposta, avisos_emails: [] }, dados, { db, fetch: fetch as never, env });
    expect(r.para).toEqual(["tais.oliari@grougp.com.br"]);
  });
  it("falha do serviço não lança erro e fica registrada", async () => {
    const { db, logs } = dbFalso();
    const fetch = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const r = await enviarAvisoPorEmail(proposta, dados, { db, fetch: fetch as never, env });
    expect(r.status).toBe("erro");
    expect(logs[0]).toMatchObject({ status: "error" });
    expect(String((logs[0].detail as { erro: string }).erro)).toContain("401");
  });
  it("rede caída não lança erro", async () => {
    const { db, logs } = dbFalso();
    const fetch = vi.fn(async () => {
      throw new Error("timeout");
    });
    await expect(enviarAvisoPorEmail(proposta, dados, { db, fetch: fetch as never, env })).resolves.toMatchObject({ status: "erro" });
    expect(logs[0]).toMatchObject({ status: "error" });
  });
  it("modo simulado não chama o serviço", async () => {
    const { db, logs } = dbFalso();
    const fetch = vi.fn();
    const r = await enviarAvisoPorEmail(proposta, dados, { db, fetch: fetch as never, env: { PROPOSTA_AVISOS_EMAIL_SIMULAR: "1" } });
    expect(r.status).toBe("simulado");
    expect(fetch).not.toHaveBeenCalled();
    expect(logs[0]).toMatchObject({ status: "simulado" });
  });
});
