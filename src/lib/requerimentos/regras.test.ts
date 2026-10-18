import { describe, expect, it } from "vitest";
import { diasUteisEntre, licencaParaConferir, logisticaPadrao, logisticaPendente } from "./regras";

describe("logística do requerimento", () => {
  it("online, presencial e híbrido trazem os itens do modelo", () => {
    expect(logisticaPadrao("online").every((i) => i.grupo === "online")).toBe(true);
    expect(logisticaPadrao("presencial").some((i) => i.item === "Hospedagem")).toBe(true);
    const h = logisticaPadrao("hibrido", true);
    expect(new Set(h.map((i) => i.grupo))).toEqual(new Set(["online", "presencial", "assessment"]));
  });
  it("pendente = necessário sem responsável", () => {
    const itens = logisticaPadrao("presencial");
    itens[0] = { ...itens[0], necessario: true };
    itens[1] = { ...itens[1], necessario: true, responsavel: "Grou" };
    itens[2] = { ...itens[2], necessario: false };
    expect(logisticaPendente(itens).map((i) => i.item)).toEqual(["Hospedagem"]);
  });
});

describe("licença PDA", () => {
  it("conta só dias úteis", () => {
    // sexta → segunda = 1 dia útil
    expect(diasUteisEntre(new Date("2026-10-16T15:00:00Z"), new Date("2026-10-19T09:00:00Z"))).toBe(
      1,
    );
    expect(diasUteisEntre(new Date("2026-10-19T09:00:00Z"), new Date("2026-10-16T09:00:00Z"))).toBe(
      0,
    );
  });
  it("alerta depois de 2 dias úteis sem liberação", () => {
    const sexta = "2026-10-16T15:00:00Z";
    expect(
      licencaParaConferir(
        { status: "solicitado", solicitado_em: sexta },
        new Date("2026-10-19T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      licencaParaConferir(
        { status: "solicitado", solicitado_em: sexta },
        new Date("2026-10-20T12:00:00Z"),
      ),
    ).toBe(true);
    expect(
      licencaParaConferir(
        { status: "liberado", solicitado_em: sexta },
        new Date("2026-10-30T12:00:00Z"),
      ),
    ).toBe(false);
  });
});
