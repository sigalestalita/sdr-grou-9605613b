import { describe, expect, it } from "vitest";
import { filtroDoResponsavel, responsavelDoNegocio } from "./responsavel";

const A = "ce8d4ac9-67a2-4ca8-9fe3-4b743c321622";
const B = "ff538367-d74d-43b8-b450-ec2d0397acce";

describe("responsável pelo negócio", () => {
  it("usa o executivo da reunião quando há", () => {
    expect(responsavelDoNegocio({ executivo_user_id: A, owner_user_id: B })).toBe(A);
  });
  it("cai para o dono quando não há executivo", () => {
    expect(responsavelDoNegocio({ executivo_user_id: null, owner_user_id: B })).toBe(B);
    expect(responsavelDoNegocio({})).toBeNull();
  });
  it("monta o filtro e recusa id inválido", () => {
    expect(filtroDoResponsavel(A)).toBe(
      `executivo_user_id.eq.${A},and(executivo_user_id.is.null,owner_user_id.eq.${A})`,
    );
    expect(() => filtroDoResponsavel("x,owner_user_id.neq.0")).toThrow();
  });
});
