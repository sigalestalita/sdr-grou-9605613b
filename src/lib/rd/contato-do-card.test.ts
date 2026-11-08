import { describe, expect, it } from "vitest";
import { acharContato, indexarContatos, lembrarContato, normFone } from "./contato-do-card";

describe("contato do card do RD", () => {
  const idx = indexarContatos([
    { id: "c1", rd_contact_id: "rd1", email: "Ana@Acme.com" },
    { id: "c2", email: null, telefone: "5551998174609" },
    { id: "c3", emails: ["outro@x.com"], phones: ["(41) 3308-8608"] },
  ]);

  it("casa por id, e-mail ou telefone", () => {
    expect(acharContato(idx, { _id: "rd1" })).toBe("c1");
    expect(acharContato(idx, { emails: [{ email: " ana@acme.com " }] })).toBe("c1");
    expect(acharContato(idx, { phones: [{ phone: "+5551998174609" }] })).toBe("c2");
    expect(acharContato(idx, { phones: [{ phone: "+55(41)3308-8608" }] })).toBe("c3");
    expect(acharContato(idx, { emails: [{ email: "outro@x.com" }] })).toBe("c3");
    expect(acharContato(idx, { name: "Sem dados" })).toBeNull();
  });

  it("normaliza telefone e lembra contato novo", () => {
    expect(normFone("+55 (51) 99817-4609")).toBe("51998174609");
    expect(normFone("123")).toBeNull();
    lembrarContato(idx, "c9", { emails: [{ email: "novo@y.com" }] });
    expect(acharContato(idx, { emails: [{ email: "NOVO@y.com" }] })).toBe("c9");
  });

  it("só com o nome: casa dentro da empresa do negócio", async () => {
    const { indexarContatos, acharContato, chaveDoNovo } = await import("./contato-do-card");
    const i = indexarContatos([{ id: "n1", nome: "João  Silva", company_id: "e1" }]);
    expect(acharContato(i, { name: "joão silva" }, "e1")).toBe("n1");
    expect(acharContato(i, { name: "João Silva" }, "e2")).toBeNull();
    expect(acharContato(i, { name: "João Silva" })).toBeNull();
    expect(chaveDoNovo({ name: "Ana" }, "e1")).toBe("e1|ana");
    expect(chaveDoNovo({ name: "Ana" })).toBeNull();
  });
});
