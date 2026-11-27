import { describe, expect, it } from "vitest";
import { EXTRAS_COEXISTENCIA } from "./embedded-signup-button";

describe("cadastro incorporado do WhatsApp", () => {
  it("abre a coexistência no formato v4 que a Meta exige", () => {
    expect(EXTRAS_COEXISTENCIA).toEqual({
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3",
      version: "v4",
    });
  });
});
