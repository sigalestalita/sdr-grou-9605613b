import { describe, expect, it } from "vitest";
import { suggestFeatures } from "./features";

const base = { tagUso: "ambos", licenseDays: 200, signal: "verde", weeksInColor: 9, pessoasMapeadas: 12, modulos: [5] };
const ids = (i: Parameters<typeof suggestFeatures>[0], o: Parameters<typeof suggestFeatures>[1] = []) =>
  suggestFeatures(i, o).map((s) => s.featureId);

describe("funcionalidades da plataforma", () => {
  it("cliente maduro, verde consolidado, ambos os usos, módulo 5: tudo se aplica", () => {
    expect(ids(base)).toEqual(["compat_cargos", "compat_competencias", "tendencias_grupo", "lider_liderado", "feedback_360"]);
  });
  it("tag_uso e tempo de uso filtram", () => {
    expect(ids({ ...base, tagUso: "recrutamento", licenseDays: 100, modulos: [] })).toEqual(["compat_cargos"]);
    expect(ids({ ...base, licenseDays: 30 })).toEqual(["lider_liderado"]);
  });
  it("tendências de grupo exige 5+ pessoas e verde consolidado", () => {
    expect(ids({ ...base, pessoasMapeadas: 3 })).not.toContain("tendencias_grupo");
    expect(ids({ ...base, weeksInColor: 2 })).not.toContain("tendencias_grupo");
  });
  it("vermelho inicial não recebe cargos/360; líder × liderado vale até no vermelho", () => {
    expect(ids({ ...base, signal: "vermelho", weeksInColor: 1 })).toEqual(["lider_liderado"]);
  });
  it("oferta recente, recusa e adoção bloqueiam", () => {
    const hoje = new Date().toISOString().slice(0, 10);
    expect(ids(base, [{ feature_id: "compat_cargos", status: "adotada", offered_at: "2026-01-01" }])).not.toContain("compat_cargos");
    expect(ids(base, [{ feature_id: "feedback_360", status: "recusada", offered_at: hoje }])).not.toContain("feedback_360");
    expect(ids(base, [{ feature_id: "feedback_360", status: "oferecida", offered_at: "2026-01-01" }])).toContain("feedback_360");
  });
});
