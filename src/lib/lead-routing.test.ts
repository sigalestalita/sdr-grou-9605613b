import { describe, expect, it } from "vitest";
import { seguirDonoDoRd } from "./lead-routing.server";

// Supabase falso: guarda as tabelas em memória e responde à cadeia usada.
function fakeSupabase(tabelas: Record<string, Array<Record<string, unknown>>>) {
  const escritas: Array<{ tabela: string; op: string; valor: unknown }> = [];
  const from = (tabela: string) => {
    const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
    let update: Record<string, unknown> | null = null;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => {
        filtros.push((r) => r[c] === v);
        if (update) {
          for (const r of tabelas[tabela] ?? [])
            if (filtros.every((f) => f(r))) Object.assign(r, update);
          escritas.push({ tabela, op: "update", valor: update });
        }
        return q;
      },
      ilike: (c: string, v: string) => {
        filtros.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase());
        return q;
      },
      maybeSingle: async () => ({
        data: (tabelas[tabela] ?? []).find((r) => filtros.every((f) => f(r))) ?? null,
      }),
      update: (v: Record<string, unknown>) => {
        update = v;
        return q;
      },
      insert: async (v: unknown) => {
        escritas.push({ tabela, op: "insert", valor: v });
        return {};
      },
    };
    return q;
  };
  return { from, escritas };
}

describe("seguirDonoDoRd", () => {
  it("passa o card para quem o RD escolheu", async () => {
    const tabelas = {
      profiles: [
        { id: "camila", email: "camila.mattie@grougp.com.br" },
        { id: "lisiane", email: "lisiane@grougp.com.br" },
      ],
      leads: [{ id: "l1", assigned_to: "camila" }],
    };
    const sb = fakeSupabase(tabelas);
    const r = await seguirDonoDoRd({
      supabase: sb,
      leadId: "l1",
      rdUserEmail: "Lisiane@grougp.com.br",
      rdUserName: "Lisiane",
    });
    expect(r).toBe("lisiane");
    expect(tabelas.leads[0].assigned_to).toBe("lisiane");
    expect(sb.escritas.some((e) => e.tabela === "lead_interactions")).toBe(true);
  });

  it("não mexe quando já bate ou quando o usuário do RD não existe no Compass", async () => {
    const tabelas = {
      profiles: [{ id: "camila", email: "camila.mattie@grougp.com.br" }],
      leads: [{ id: "l1", assigned_to: "camila" }],
    };
    const sb = fakeSupabase(tabelas);
    expect(
      await seguirDonoDoRd({
        supabase: sb,
        leadId: "l1",
        rdUserEmail: "camila.mattie@grougp.com.br",
      }),
    ).toBe("camila");
    expect(
      await seguirDonoDoRd({ supabase: sb, leadId: "l1", rdUserEmail: "ninguem@x.com" }),
    ).toBeNull();
    expect(await seguirDonoDoRd({ supabase: sb, leadId: "l1", rdUserEmail: null })).toBeNull();
    expect(sb.escritas).toHaveLength(0);
    expect(tabelas.leads[0].assigned_to).toBe("camila");
  });
});
