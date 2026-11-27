import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acaoSalesCoach,
  ErroIntegracao,
  exato,
  hashToken,
  lerId,
  literal,
  novoToken,
  slugCampo,
  TOKEN_RE,
  tokenValido,
} from "./integracao-sales-coach.server";
import { ENDERECO_INTEGRACAO } from "./integracao-sales-coach.functions";

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
});
