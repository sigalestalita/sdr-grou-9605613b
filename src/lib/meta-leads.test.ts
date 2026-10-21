import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { assinaturaValida, avisosDoWebhook, campoDaPergunta, leadDoMetaParaLinha } =
  await import("./meta-leads.server");

describe("leads do Meta", () => {
  it("lê os avisos de leadgen do webhook", () => {
    const corpo = {
      object: "page",
      entry: [
        {
          id: "111",
          changes: [
            { field: "leadgen", value: { leadgen_id: 999, page_id: "111", form_id: "77" } },
            { field: "feed", value: {} },
          ],
        },
      ],
    };
    expect(avisosDoWebhook(corpo)).toEqual([{ leadgenId: "999", pageId: "111", formId: "77" }]);
    expect(avisosDoWebhook(null)).toEqual([]);
  });

  it("valida a assinatura do Meta", () => {
    const corpo = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "seg").update(corpo).digest("hex");
    expect(assinaturaValida(corpo, sig, "seg")).toBe(true);
    expect(assinaturaValida(corpo, sig, "outro")).toBe(false);
    expect(assinaturaValida(corpo, null, "seg")).toBe(false);
  });

  it("casa as perguntas com os campos do lead", () => {
    expect(campoDaPergunta("qual_o_porte_da_sua_empresa?", "21_-_50")).toBe("porte");
    expect(campoDaPergunta("nome_da_empresa", "ACME")).toBe("empresa");
    expect(campoDaPergunta("você_é:", "sou_de_empresa")).toBe("tipo");
    expect(campoDaPergunta("qualquer_coisa", "interesse_pessoal_(b2c)")).toBe("tipo");
    expect(campoDaPergunta("job_title", "analista")).toBe("cargo");
    expect(campoDaPergunta("área_de_atuação", "rh")).toBe("area");
    expect(campoDaPergunta("phone_number", "+55")).toBe("telefone");
  });

  it("monta a mesma linha que a planilha, com o lead_id do Meta", () => {
    const l = leadDoMetaParaLinha({
      id: "1345763517604762",
      created_time: "2026-10-19T22:11:00+0000",
      form_id: "1175393374371809",
      campaign_name: "produto_pda",
      field_data: [
        { name: "first_name", values: ["Roberta"] },
        { name: "last_name", values: ["Carbonell"] },
        { name: "email", values: ["RocCarbonell@hotmail.com"] },
        { name: "phone_number", values: ["21974190849"] },
        { name: "tipo_de_lead", values: ["sou_pessoa_fisica"] },
        { name: "pergunta_nova", values: ["x"] },
      ],
    });
    expect(l.meta_lead_id).toBe("1345763517604762");
    expect(l.source).toBe("meta_ads");
    expect(l.payload.name).toBe("Roberta Carbonell");
    expect(l.payload.email).toBe("roccarbonell@hotmail.com");
    expect(l.payload.phone).toBe("+5521974190849");
    expect(l.payload.campaign).toBe("produto_pda");
    expect(l.payload.form_payload.lead_id).toBe("1345763517604762");
    expect(l.payload.form_payload.lead_type).toBe("sou_pessoa_fisica");
    expect(l.payload.form_payload.campos_meta).toMatchObject({ pergunta_nova: "x" });
    expect(l.payload.submitted_at).toBe("2026-10-19T22:11:00.000Z");
  });
});
