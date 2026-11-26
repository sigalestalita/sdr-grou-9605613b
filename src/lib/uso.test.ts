import { describe, expect, it } from "vitest";
import { formatarMinutos, podeVerLogsDeUso } from "./uso";
import { rotaSemIds, rotuloDaRota } from "./uso-telas";

describe("podeVerLogsDeUso", () => {
  it("só a Talita, sem ligar para maiúsculas e espaços", () => {
    expect(podeVerLogsDeUso("talita.sigales@grougp.com.br")).toBe(true);
    expect(podeVerLogsDeUso(" Talita.Sigales@GROUGP.com.br ")).toBe(true);
    expect(podeVerLogsDeUso("outra.pessoa@grougp.com.br")).toBe(false);
    expect(podeVerLogsDeUso(null)).toBe(false);
    expect(podeVerLogsDeUso("")).toBe(false);
  });
});

describe("rotuloDaRota", () => {
  it("dá o nome da tela, inclusive com id na rota", () => {
    expect(rotuloDaRota("/kanban")).toBe("Pipeline (SDR)");
    expect(rotuloDaRota("/lead/0f8b3c1e-2a4d-4e5f-9a1b-2c3d4e5f6a7b")).toBe("Página do lead");
    expect(rotuloDaRota("/lead/:id")).toBe("Página do lead");
    expect(rotuloDaRota("/empresas/BVA-0231")).toMatch(/empresa/i);
  });

  it("prefere a rota mais específica", () => {
    expect(rotuloDaRota("/whatsapp/templates")).toBe("WhatsApp — Templates");
    expect(rotuloDaRota("/whatsapp")).toBe("WhatsApp — Inbox (Caixa de entrada)");
  });

  it("rota sem nome no guia volta como está", () => {
    expect(rotuloDaRota("/uso")).toBe("/uso");
    expect(rotuloDaRota(null)).toBe("/");
  });

  it("troca uuid por :id", () => {
    expect(rotaSemIds("/negocio/0F8B3C1E-2A4D-4E5F-9A1B-2C3D4E5F6A7B/x")).toBe("/negocio/:id/x");
  });
});

describe("formatarMinutos", () => {
  it("horas e minutos", () => {
    expect(formatarMinutos(0)).toBe("—");
    expect(formatarMinutos(45)).toBe("45 min");
    expect(formatarMinutos(120)).toBe("2 h");
    expect(formatarMinutos(135)).toBe("2 h 15 min");
  });
});
