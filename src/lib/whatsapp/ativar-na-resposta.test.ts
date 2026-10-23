import { describe, expect, it } from "vitest";
import { ativarLeadQueRespondeu } from "./ativar-na-resposta.server";

function fake(lead: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const db = {
    from(t: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: t === "stages" ? { id: "st-novo" } : lead }),
          }),
        }),
        update: (row: Record<string, unknown>) => {
          updates.push(row);
          return { eq: async () => ({}) };
        },
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return {};
        },
      };
    },
  };
  return { db: db as never, updates, inserts };
}

describe("ativarLeadQueRespondeu", () => {
  it("mostra no kanban, na etapa Novo, o lead de lista que respondeu", async () => {
    const f = fake({
      oculto_sdr: true,
      stage_id: null,
      campaign: "Sales Sprint",
      form_payload: { ativar_ao_responder: true, campanha_id: "c1" },
    });
    expect(await ativarLeadQueRespondeu(f.db, "l1")).toBe(true);
    expect(f.updates[0]).toMatchObject({
      oculto_sdr: false,
      stage_id: "st-novo",
      form_payload: { ativar_ao_responder: false, campanha_id: "c1" },
    });
    expect(f.inserts).toHaveLength(1);
  });

  it("não mexe em lead oculto que não veio de lista (ex.: RD ainda não migrado)", async () => {
    const f = fake({ oculto_sdr: true, stage_id: null, form_payload: {} });
    expect(await ativarLeadQueRespondeu(f.db, "l1")).toBe(false);
    expect(f.updates).toHaveLength(0);
  });

  it("não mexe em lead que já está visível", async () => {
    const f = fake({ oculto_sdr: false, form_payload: { ativar_ao_responder: true } });
    expect(await ativarLeadQueRespondeu(f.db, "l1")).toBe(false);
  });
});
