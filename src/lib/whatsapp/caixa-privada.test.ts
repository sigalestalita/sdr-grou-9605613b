import { describe, expect, it } from "vitest";
import { filtrarCaixasPrivadas } from "./caixa-privada";

const talita = "user-talita";
const lisiane = "user-lisiane";

const conversas = [
  { id: "a", assigned_user_id: talita },
  { id: "b", assigned_user_id: lisiane },
  { id: "c", assigned_user_id: null },
];

describe("filtrarCaixasPrivadas", () => {
  it("esconde a conversa da caixa privada de outra pessoa", () => {
    const r = filtrarCaixasPrivadas(conversas, [talita], lisiane);
    expect(r.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("mostra à dona da caixa as conversas dela", () => {
    const r = filtrarCaixasPrivadas(conversas, [talita], talita);
    expect(r.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("nunca esconde a fila geral", () => {
    const r = filtrarCaixasPrivadas(conversas, [talita, lisiane], "outra-pessoa");
    expect(r.map((c) => c.id)).toEqual(["c"]);
  });

  it("sem caixa privada configurada, não mexe em nada", () => {
    expect(filtrarCaixasPrivadas(conversas, [], lisiane)).toHaveLength(3);
  });
});
