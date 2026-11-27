import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acaoSalesCoach,
  type Candidatos,
  ErroIntegracao,
  escolherAlvos,
  exato,
  hashToken,
  lerId,
  lerReuniao,
  literal,
  novoToken,
  slugCampo,
  TOKEN_RE,
  tokenValido,
} from "./integracao-sales-coach.server";
import { ENDERECO_INTEGRACAO } from "./integracao-sales-coach.functions";
import { valorDoCampo } from "./reunioes-analisadas.functions";

const U = "0b5c1f7e-8d2a-4c3b-9e1f-2a3b4c5d6e7f";

describe("integração Sales Coach", () => {
  it("lê o id do Sales Coach", () => {
    expect(lerId(U)).toEqual({ tipo: "negocio", ref: U });
    expect(lerId(`conta:${U}`)).toEqual({ tipo: "conta", ref: U });
    expect(lerId(`lead:${U.toUpperCase()}`)).toEqual({ tipo: "lead", ref: U });
    expect(() => lerId("conta:1; drop table")).toThrow(ErroIntegracao);
    expect(() => lerId(`oportunidade:${U}`)).toThrow("Negócio não encontrado");
  });

  it("gera tokens no formato que o Sales Coach aceita e guarda só o hash", () => {
    const t = novoToken();
    expect(TOKEN_RE.test(t)).toBe(true);
    expect(novoToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("limpa textos de busca", () => {
    expect(literal("Ana (Grou), 100%")).toBe("Ana  Grou   100");
    expect(exato("a_b%c@x.com")).toBe("a\\_b\\%c@x.com");
    expect(slugCampo("Nota da reunião (0–100)")).toBe("nota_da_reuniao_0_100");
    expect(slugCampo("!!!")).toBe("campo");
  });

  it("usa sempre o endereço oficial do Compass", () => {
    expect(ENDERECO_INTEGRACAO).toBe("https://compass.grougp.com/api/public/integracao");
  });

  it("responde info e recusa ação desconhecida", async () => {
    const db = {} as SupabaseClient;
    expect(await acaoSalesCoach(db, { action: "info" })).toEqual({ conta: "Compass · Grou" });
    await expect(acaoSalesCoach(db, { action: "por_email", email: "x" })).rejects.toThrow(
      "Informe o e-mail",
    );
    await expect(acaoSalesCoach(db, { action: "nota" })).rejects.toThrow("Informe o negócio");
  });

  it("recusa token fora do formato sem ir ao banco", async () => {
    const db = {
      from: () => {
        throw new Error("não devia consultar");
      },
    } as unknown as SupabaseClient;
    expect(await tokenValido(db, "Bearer lumi_abcdefghijklmnopqrstuvwxyz")).toBeNull();
    expect(await tokenValido(db, "")).toBeNull();
  });

  const EXEC = "11111111-1111-4111-8111-111111111111";
  const CS = "22222222-2222-4222-8222-222222222222";
  const base: Candidatos = {
    abertos: [
      { id: "d1", name: "Upsell PDA", status: "ongoing", fields: {}, responsavel: EXEC },
      { id: "d2", name: "Renovação", status: "ongoing", fields: {}, responsavel: "outro" },
    ],
    fechados: [{ id: "d0", name: "Venda 2025", status: "won", fields: {} }],
    empresas: [{ id: "e1", nome: "XPTO" }],
    contatos: [{ id: "c1", nome: "Ana" }],
    leads: [],
  };

  it("reunião de atendimento fica na empresa, nunca no negócio comercial", () => {
    const r = escolherAlvos(base, { tipo: "atendimento" }, CS);
    expect(r.map((x) => x.id)).toEqual(["conta:e1"]);
  });

  it("venda de quem tem negócio aberto vai para o negócio dele", () => {
    const r = escolherAlvos(base, { tipo: "venda" }, EXEC);
    expect(r.filter((x) => x.status === "ongoing").map((x) => x.id)).toEqual(["d1"]);
  });

  it("venda de quem não tem negócio aberto fica na empresa (não vira negócio)", () => {
    const r = escolherAlvos(base, { tipo: "venda" }, CS);
    expect(r.map((x) => x.id)).toEqual(["conta:e1"]);
  });

  it("sem saber quem conduziu, oferece os negócios abertos para escolher", () => {
    const r = escolherAlvos(base, null, null);
    expect(r.filter((x) => x.status === "ongoing").map((x) => x.id)).toEqual(["d1", "d2"]);
    const semNegocio = escolherAlvos({ ...base, abertos: [] }, null, null);
    expect(semNegocio[0].id).toBe("conta:e1");
  });

  it("sem empresa, a reunião fica no contato", () => {
    const r = escolherAlvos({ ...base, empresas: [] }, { tipo: "atendimento" }, CS);
    expect(r.map((x) => x.id)).toEqual(["contato:c1"]);
  });

  it("lê o contexto da reunião com segurança", () => {
    expect(lerReuniao(null)).toBeNull();
    expect(lerReuniao({ tipo: "venda" })).toBeNull();
    const r = lerReuniao({
      id: "m1",
      tipo: "atendimento",
      data: "2026-11-27T14:00:00Z",
      conduzida_por: { email: "Ana@GrouGP.com.br", nome: "Ana" },
      participante: { email: "não é e-mail" },
      link: "javascript:alert(1)",
    });
    expect(r?.tipo).toBe("atendimento");
    expect(r?.conduzidaPor.email).toBe("ana@grougp.com.br");
    expect(r?.participante.email).toBeNull();
    expect(r?.link).toBeNull();
    expect(lerReuniao({ id: "m2", tipo: "qualquer" })?.tipo).toBe("venda");
  });

  it("escrever sem o contexto da reunião pede o Sales Coach atualizado", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { nome: "XPTO", owner_user_id: null } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(
      acaoSalesCoach(db, { action: "atualizar", id: "conta:0b5c1f7e-8d2a-4c3b-9e1f-2a3b4c5d6e7f" }),
    ).rejects.toThrow("Publique a versão nova do Sales Coach");
  });

  it("mostra os valores da análise como texto", () => {
    expect(valorDoCampo(null)).toBeNull();
    expect(valorDoCampo("")).toBeNull();
    expect(valorDoCampo(82)).toBe("82");
    expect(valorDoCampo(["preço", "prazo"])).toBe("preço, prazo");
  });
});
