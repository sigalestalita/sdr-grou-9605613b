import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executarAcao, FERRAMENTAS_ACOES, TABELAS_DA_BASE } from "./acoes.server";

// Banco falso que registra as chamadas: nenhuma ação deve chegar nele sem confirmação.
function bancoFalso() {
  const chamadas: string[] = [];
  const q: Record<string, unknown> = {};
  const encadear =
    (nome: string) =>
    (...args: unknown[]) => {
      chamadas.push(`${nome}:${JSON.stringify(args)}`);
      return q;
    };
  for (const m of [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "ilike",
    "is",
    "not",
    "in",
    "order",
    "limit",
    "range",
  ])
    q[m] = encadear(m);
  q.then = (ok: (v: unknown) => void) =>
    ok({ data: [{ id: 1, token_x: "segredo", nome: "A" }], error: null, count: 1 });
  const db = {
    from: (t: string) => {
      chamadas.push(`from:${t}`);
      return q;
    },
    rpc: (n: string) => {
      chamadas.push(`rpc:${n}`);
      return Promise.resolve({ data: [], error: null });
    },
  };
  return { db: db as unknown as SupabaseClient, chamadas };
}

describe("ações da assistente", () => {
  it("não executa nada que cria ou altera sem confirmado: true", async () => {
    for (const nome of [
      "criar_negocio",
      "definir_itens_negocio",
      "gerar_proposta",
      "criar_relatorio",
      "criar_segmentacao",
    ]) {
      const { db, chamadas } = bancoFalso();
      const r = (await executarAcao(db, "u", nome, { negocio_id: "x" })) as {
        precisa_confirmar?: boolean;
      };
      expect(r.precisa_confirmar).toBe(true);
      expect(chamadas).toEqual([]);
    }
  });

  it("consulta só tabelas da lista e recusa coluna inválida", async () => {
    const { db } = bancoFalso();
    await expect(
      executarAcao(db, "u", "consultar_base", { tabela: "contaazul_tokens" }),
    ).rejects.toThrow();
    await expect(
      executarAcao(db, "u", "consultar_base", {
        tabela: "deals",
        filtros: [{ coluna: "status;drop", operador: "igual", valor: "x" }],
      }),
    ).rejects.toThrow(/Coluna inválida/);
    await expect(
      executarAcao(db, "u", "consultar_base", { tabela: "deals", colunas: "id; delete" }),
    ).rejects.toThrow(/colunas inválida/);
  });

  it("tira colunas sensíveis do resultado", async () => {
    const { db } = bancoFalso();
    const r = (await executarAcao(db, "u", "consultar_base", { tabela: "deals" })) as {
      linhas: Array<Record<string, unknown>>;
    };
    expect(r.linhas[0]).toEqual({ id: 1, nome: "A" });
  });

  it("não expõe tabelas de credenciais e cada ferramenta tem nome único", () => {
    for (const t of [
      "contaazul_tokens",
      "rd_oauth_tokens",
      "cs_user_integrations",
      "cs_settings",
      "app_settings",
      "whatsapp_accounts",
    ])
      expect(TABELAS_DA_BASE[t]).toBeUndefined();
    const nomes = FERRAMENTAS_ACOES.map((f) => f.function.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
