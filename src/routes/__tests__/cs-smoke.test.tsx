/**
 * Smoke test do módulo Customer Success:
 * 1) a rota /cs carrega (módulo + metadados),
 * 2) a importação CSV da carteira é interpretada corretamente,
 * 3) o card do cliente renderiza health score e sinaleira das 8 semanas.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseCsvClients } from "@/lib/cs-import";
import {
  DEFAULT_HEALTH_WEIGHTS,
  analyzeSignalTrend,
  computeHealthScore,
  healthLabel,
  lastNWeeks,
  type CsSignal,
} from "@/lib/cs-types";
import { CsClientCard } from "@/components/cs/cs-client-card";

vi.mock("@/lib/cs.functions", () => ({
  listCsBoard: vi.fn(),
  moveCsStage: vi.fn(),
  runCsAlertScan: vi.fn(),
  saveCsClient: vi.fn(),
  syncCsSignal: vi.fn(),
}));

describe("CS — rota carrega", () => {
  it("expõe a rota /_app/cs com componente e metadados próprios", async () => {
    const mod = await import("@/routes/_app.cs");
    expect(mod.Route).toBeTruthy();
    const opts = (mod.Route as unknown as { options: { component?: unknown; head?: () => { meta: Array<Record<string, string>> } } }).options;
    expect(typeof opts.component).toBe("function");
    const meta = opts.head?.().meta ?? [];
    expect(meta.some((m) => m.title?.includes("Customer Success"))).toBe(true);
  });
});

describe("CS — importação CSV da carteira", () => {
  const csv = [
    "nome_empresa;cnpj;tipo_lead;origem;aporte_valor;data_inicio_contrato;cs_responsavel_email",
    "Acme Industria;12.345.678/0001-99;empresa;outbound;1.250,50;10/03/2026;ana@grougp.com.br",
    "Consultoria Beta;;consultoria;indicacao;800;2026-04-01;",
    ";;empresa;marketing;100;;",
  ].join("\n");

  it("lê linhas válidas, normaliza valores, datas e tipos", () => {
    const rows = parseCsvClients(csv);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      nome_empresa: "Acme Industria",
      tipo_lead: "empresa",
      origem: "outbound",
      aporte_valor: 1250.5,
      data_inicio_contrato: "2026-03-10",
      cs_responsavel_email: "ana@grougp.com.br",
    });

    expect(rows[1]).toMatchObject({
      nome_empresa: "Consultoria Beta",
      tipo_lead: "consultoria",
      origem: "indicacao",
      data_inicio_contrato: "2026-04-01",
      cnpj: null,
      cs_responsavel_email: null,
    });
  });

  it("aceita CSV com vírgula e ignora origem inválida", () => {
    const rows = parseCsvClients("nome_empresa,tipo_lead,origem\nGama Ltda,empresa,xpto");
    expect(rows).toEqual([expect.objectContaining({ nome_empresa: "Gama Ltda", origem: "marketing", aporte_valor: 0 })]);
  });

  it("retorna vazio sem linhas de dados", () => {
    expect(parseCsvClients("nome_empresa;origem")).toEqual([]);
    expect(parseCsvClients("")).toEqual([]);
  });
});

describe("CS — health score e sinaleira", () => {
  it("calcula health score e rótulo coerentes com o engajamento", () => {
    const top = computeHealthScore(
      { signal: "verde", agendaLast90d: 2, whatsappAnswered: true, emailAnswered: true, csPlatformUse: true },
      DEFAULT_HEALTH_WEIGHTS,
    );
    const bottom = computeHealthScore(
      { signal: "vermelho", agendaLast90d: 0, whatsappAnswered: false, emailAnswered: false, csPlatformUse: false },
      DEFAULT_HEALTH_WEIGHTS,
    );
    expect(top).toBe(100);
    expect(bottom).toBeLessThan(40);
    expect(healthLabel(top).label).toBe("Saudável");
    expect(healthLabel(bottom).label).toBe("Risco");
    expect(healthLabel(55).label).toBe("Atenção");
  });

  it("detecta tendências crítica, de queda e de oportunidade", () => {
    const red: CsSignal[] = ["vermelho", "vermelho", "vermelho", "vermelho", "vermelho"];
    expect(analyzeSignalTrend(red)).toEqual({ kind: "critico", weeks: 5 });
    expect(analyzeSignalTrend(["verde", "vermelho"])).toEqual({ kind: "queda" });
    expect(analyzeSignalTrend(["verde", "verde", "verde", "verde", "verde"])).toEqual({
      kind: "oportunidade",
      weeks: 5,
    });
    expect(analyzeSignalTrend(["sem_dado", "sem_dado"])).toEqual({ kind: "estavel" });
  });
});

describe("CS — card do cliente", () => {
  const weeks = lastNWeeks(8, new Date("2026-08-24T00:00:00Z"));
  const history: CsSignal[] = ["verde", "verde", "amarelo", "verde", "verde", "verde", "verde", "vermelho"];

  const client = {
    client_uid: "A1B2",
    nome_empresa: "Acme Industria",
    origem: "outbound",
    tipo_lead: "consultoria",
    journey_stage: "ativacao",
    current_signal: "vermelho",
    health_score: 42,
    stage_entered_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  };

  it("renderiza identificação, health, sinaleira das 8 semanas, tags e alerta", () => {
    render(
      <CsClientCard
        client={client}
        history={history}
        weeks={weeks}
        ownerName="Mariana Borges"
        alerts={[{ id: "al-1", reason: "Sem contato há 50 dias" }]}
        tags={["risco_churn", "risco_churn", "onboarding_atrasado"]}
        slaDays={60}
      />,
    );

    const card = screen.getByTestId("cs-card-A1B2");
    expect(screen.getByText("Acme Industria")).toBeTruthy();
    expect(screen.getByText("A1B2")).toBeTruthy();
    expect(screen.getByText(/Mariana Borges/)).toBeTruthy();
    expect(screen.getByText("Health 42")).toBeTruthy();
    expect(screen.getByText(/Consultoria/)).toBeTruthy();
    expect(screen.getByText(/SLA da etapa estourado \(60d\)/)).toBeTruthy();
    expect(screen.getByText(/1 alerta\(s\)/)).toBeTruthy();
    expect(screen.getByText("Sem contato há 50 dias")).toBeTruthy();

    // sinaleira: 8 semanas, última vermelha, com tooltip da semana
    const dots = card.querySelectorAll("span[title]");
    expect(dots).toHaveLength(8);
    expect(dots[7].getAttribute("title")).toContain(weeks[7]);
    expect(dots[7].className).toContain("bg-red-500");
    expect(dots[0].className).toContain("bg-emerald-500");
    expect(dots[2].className).toContain("bg-amber-400");

    // sinal vermelho destaca o card
    expect(card.className).toContain("bg-red-500/5");

    // tags deduplicadas
    expect(screen.getAllByText("risco_churn")).toHaveLength(1);
  });

  it("mostra oportunidade de expansão em sequência verde", () => {
    render(
      <CsClientCard
        client={{ ...client, client_uid: "C3D4", current_signal: "verde", health_score: 88, tipo_lead: "empresa" }}
        history={["verde", "verde", "verde", "verde", "verde"]}
        weeks={weeks.slice(3)}
        ownerName="Camila Mattie"
      />,
    );
    expect(screen.getByText(/oportunidade de expansão/)).toBeTruthy();
    expect(screen.getByText("Health 88")).toBeTruthy();
  });
});
