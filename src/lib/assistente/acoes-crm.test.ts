import { describe, expect, it } from "vitest";
import type { CtxNucleo } from "@/lib/nucleo";
import { ACOES_CRM, executarAcaoCrm, FERRAMENTA_ACOES_CRM } from "./acoes-crm.server";

// Qualquer toque no banco quebra o teste: nada pode chegar lá sem confirmação/validação.
const ctx = {
  supabase: new Proxy(
    {},
    {
      get: () => {
        throw new Error("tocou no banco");
      },
    },
  ),
  userId: "00000000-0000-0000-0000-000000000001",
} as unknown as CtxNucleo;

describe("ações de tarefas, CS e negócios pela assistente", () => {
  it("nada roda sem confirmado: true", async () => {
    for (const acao of Object.keys(ACOES_CRM)) {
      const r = (await executarAcaoCrm(ctx, { acao, dados: {} })) as {
        precisa_confirmar?: boolean;
      };
      expect(r.precisa_confirmar).toBe(true);
    }
  });

  it("não apaga tarefa", async () => {
    await expect(
      executarAcaoCrm(ctx, {
        acao: "status_tarefa_cs",
        confirmado: true,
        dados: { id: "00000000-0000-0000-0000-000000000002", action: "apagar" },
      }),
    ).rejects.toThrow(/não apaga/);
  });

  it("devolve o que está faltando, sem tocar no banco", async () => {
    await expect(
      executarAcaoCrm(ctx, {
        acao: "criar_tarefa_cs",
        confirmado: true,
        dados: { clientUid: "AB12" },
      }),
    ).rejects.toThrow(/Dados inválidos: .*title/);
    await expect(
      executarAcaoCrm(ctx, {
        acao: "fechar_negocio",
        confirmado: true,
        dados: { resultado: "perdido" },
      }),
    ).rejects.toThrow(/Dados inválidos/);
  });

  it("toda ação acha o esquema e o núcleo da tela", async () => {
    for (const [nome, a] of Object.entries(ACOES_CRM)) {
      const { schema, nucleo } = await a.carregar();
      expect(typeof schema.parse, nome).toBe("function");
      expect(typeof nucleo, nome).toBe("function");
    }
    expect(FERRAMENTA_ACOES_CRM.function.parameters.properties.acao.enum).toEqual(
      Object.keys(ACOES_CRM),
    );
  });
});
