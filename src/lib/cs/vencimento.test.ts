import { describe, expect, it } from "vitest";
import { faixaVencimento } from "./vencimento";

const agora = new Date(2026, 10, 17, 10, 0, 0); // 17/11/2026

describe("faixa de vencimento dos créditos", () => {
  it("separa vencido, menos de 1 mês, meses e mais de 1 ano", () => {
    expect(faixaVencimento("2026-11-16", agora)).toBe("vencido");
    expect(faixaVencimento("2026-11-17", agora)).toBe("menos_1");
    expect(faixaVencimento("2026-12-10", agora)).toBe("menos_1");
    expect(faixaVencimento("2026-12-20", agora)).toBe("m1");
    expect(faixaVencimento("2027-02-20", agora)).toBe("m3");
    expect(faixaVencimento("2027-11-20", agora)).toBe("m12");
    expect(faixaVencimento("2028-02-01", agora)).toBe("mais_1_ano");
  });
  it("sem data quando não há vencimento", () => {
    expect(faixaVencimento(null, agora)).toBe("sem_data");
    expect(faixaVencimento("", agora)).toBe("sem_data");
  });
});
