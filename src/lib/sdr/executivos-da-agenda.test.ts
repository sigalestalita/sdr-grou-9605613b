import { describe, expect, it } from "vitest";
import { filtrarExecutivosDaAgenda } from "./executivos-da-agenda";

describe("filtrarExecutivosDaAgenda", () => {
  it("sem lista configurada, vale o papel executivo", () => {
    expect(filtrarExecutivosDaAgenda(["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(filtrarExecutivosDaAgenda(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("com lista, só quem está nela e tem o papel", () => {
    expect(filtrarExecutivosDaAgenda(["a", "b", "c"], ["c", "a", "x", 3])).toEqual(["c", "a"]);
  });
});
