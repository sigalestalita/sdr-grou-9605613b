import { describe, expect, it } from "vitest";
import { dataSP, hojeSP, inicioDoDiaSP } from "./datas-sp";

describe("datas em Brasília", () => {
  it("venda às 22h de 31/10 continua em outubro", () => {
    expect(dataSP("2026-11-01T01:00:00Z")).toBe("2026-10-31");
    expect(dataSP("2026-11-01T03:00:00Z")).toBe("2026-11-01");
  });
  it("hoje depois das 21h ainda é hoje", () => {
    expect(hojeSP(new Date("2026-10-19T01:30:00Z"))).toBe("2026-10-18");
  });
  it("limite de filtro com o fuso", () => {
    expect(inicioDoDiaSP("2026-10-01")).toBe("2026-10-01T00:00:00-03:00");
    expect(Date.parse(inicioDoDiaSP("2026-10-01"))).toBe(Date.parse("2026-10-01T03:00:00Z"));
  });
});
