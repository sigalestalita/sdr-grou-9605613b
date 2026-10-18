import { describe, expect, it } from "vitest";
import { toCsv } from "./export-csv";

describe("toCsv", () => {
  it("neutraliza texto que viraria fórmula, sem mexer em número", () => {
    const csv = toCsv([{ nome: '=HYPERLINK("http://x")', valor: -10, obs: "@cliente" }]);
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""http://x"")";-10;'@cliente`);
  });
});
