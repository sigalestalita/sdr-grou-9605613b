/**
 * A exigência que motivou o redesenho: cada lead aparece uma vez só.
 * E as duas ações novas que mexem em dado não disparam sem querer.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { situacaoDoLead, type LeadNaCadencia, type PassoResumo } from "@/lib/fup-agenda";
import { TRACK_STEPS } from "@/lib/sdr-playbook";
import { MatrizDaSemana } from "./matriz-semana";
import { FilaDeHoje } from "./fila-hoje";
import { ListaDeAtrasados } from "./lista-atrasados";
import type { Compromisso } from "./tipos";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));

const PME = TRACK_STEPS.pme;
// Quarta 14/10, meio da tarde. Horários da trilha (12h/18h UTC) caem no mesmo
// dia em qualquer fuso razoável, então o teste não depende da máquina.
const AGORA = new Date("2026-10-14T15:00:00.000Z");
const SEMANA = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 11 + i));

const p = (i: number, dueAt: string, feito = false): PassoResumo => ({
  id: PME[i].id,
  dueAt,
  doneAt: feito ? dueAt : null,
});

function lead(passos: PassoResumo[], extras: Partial<LeadNaCadencia> = {}): LeadNaCadencia {
  return {
    leadId: "ricardo",
    leadName: "Ricardo Alves",
    company: "Crgy",
    phone: null,
    priority: "alta",
    stageName: "Em qualificação",
    assignedTo: "lisi",
    assignedName: "Lisiane",
    touchCount: 0,
    track: "pme",
    passos,
    ...extras,
  };
}

// O Ricardo do print: três toques na quarta, dois na quinta, dois na sexta.
const RICARDO = lead([
  p(0, "2026-10-14T12:00:00.000Z"),
  p(1, "2026-10-14T12:00:00.000Z"),
  p(2, "2026-10-14T18:00:00.000Z"),
  p(3, "2026-10-15T12:00:00.000Z"),
  p(4, "2026-10-15T18:00:00.000Z"),
  p(5, "2026-10-16T12:00:00.000Z"),
  p(6, "2026-10-16T18:00:00.000Z"),
]);

const compromisso = (extras: Partial<Compromisso>): Compromisso => ({
  key: "manual:x",
  kind: "manual",
  done: false,
  dueAt: "2026-10-15T17:00:00.000Z",
  leadId: "ricardo",
  leadName: "Ricardo Alves",
  company: "Crgy",
  priority: "alta",
  stageName: null,
  assignedTo: "lisi",
  assignedName: "Lisiane",
  title: "Touch 2 — follow-up manual",
  subtitle: null,
  ...extras,
});

const linha = (l: LeadNaCadencia) => ({ lead: l, situacao: situacaoDoLead(l, AGORA) });

describe("MatrizDaSemana", () => {
  it("põe o lead numa linha só, mesmo com toques em três dias e um horário marcado", () => {
    render(
      <MatrizDaSemana
        dias={SEMANA}
        linhas={[linha(RICARDO)]}
        compromissos={[compromisso({})]}
        mostrarDono={false}
        agora={AGORA}
      />,
    );
    expect(screen.getAllByText("Ricardo Alves")).toHaveLength(1);
    expect(screen.getAllByRole("row")).toHaveLength(3); // cabeçalho, Ricardo, rodapé
  });

  it("soma o que há a fazer em cada dia no rodapé", () => {
    render(
      <MatrizDaSemana
        dias={SEMANA}
        linhas={[linha(RICARDO)]}
        compromissos={[compromisso({})]}
        mostrarDono={false}
        agora={AGORA}
      />,
    );
    const rodape = screen.getByText("A fazer no dia").closest("tr")!;
    // Seg, Ter, Qua, Qui, Sex — fim de semana vazio não vira coluna.
    expect(
      within(rodape)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["—", "—", "3", "3", "2"]);
  });
});

describe("FilaDeHoje", () => {
  it("lista os toques de hoje como checklist dentro de um card só", () => {
    const concluir = vi.fn();
    const comUmFeito = lead([
      p(0, "2026-10-14T12:00:00.000Z", true),
      p(1, "2026-10-14T12:00:00.000Z"),
      p(2, "2026-10-14T18:00:00.000Z"),
      p(3, "2026-10-15T12:00:00.000Z"),
    ]);
    render(
      <FilaDeHoje
        linhas={[linha(comUmFeito)]}
        compromissos={[]}
        mostrarDono={false}
        nomeDaSdr="Lisiane Baudini"
        atrasados={0}
        passoEmAndamento={null}
        compromissoEmAndamento={null}
        onConcluirPasso={concluir}
        onConcluirCompromisso={vi.fn()}
        onVerAtrasados={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    const caixas = screen.getAllByRole("checkbox");
    expect(caixas).toHaveLength(3);
    expect((caixas[0] as HTMLButtonElement).disabled).toBe(true); // já feito: não se desmarca daqui
    fireEvent.click(caixas[1]);
    expect(concluir).toHaveBeenCalledWith("ricardo", PME[1].id);
    // O resto da trilha aparece numa linha, não como outro card.
    expect(screen.getByText(/^Depois: qui 15\/10/)).toBeTruthy();
  });

  it("abre o roteiro já com o nome do lead e o da SDR", () => {
    render(
      <FilaDeHoje
        linhas={[linha(lead([p(0, "2026-10-14T12:00:00.000Z")]))]}
        compromissos={[]}
        mostrarDono={false}
        nomeDaSdr="Lisiane Baudini"
        atrasados={0}
        passoEmAndamento={null}
        compromissoEmAndamento={null}
        onConcluirPasso={vi.fn()}
        onConcluirCompromisso={vi.fn()}
        onVerAtrasados={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText(/Ricardo/, { selector: "p" }).textContent).not.toContain("[Nome]");
  });
});

describe("ListaDeAtrasados", () => {
  const parado = lead([p(0, "2026-10-09T12:00:00.000Z"), p(1, "2026-10-09T12:00:00.000Z")]);

  it("encerrar pede confirmação antes de mexer na cadência", () => {
    const encerrar = vi.fn();
    render(
      <ListaDeAtrasados
        linhas={[linha(parado)]}
        compromissos={[]}
        mostrarDono={false}
        emAndamento={null}
        compromissoEmAndamento={null}
        onRetomar={vi.fn()}
        onEncerrar={encerrar}
        onConcluirCompromisso={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Encerrar/ }));
    expect(encerrar).not.toHaveBeenCalled();
    expect(screen.getByText("Encerrar a cadência?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Encerrar" }));
    expect(encerrar).toHaveBeenCalledWith("ricardo");
  });

  it("mostra onde o lead parou e há quanto tempo", () => {
    render(
      <ListaDeAtrasados
        linhas={[linha(parado)]}
        compromissos={[]}
        mostrarDono={false}
        emAndamento={null}
        compromissoEmAndamento={null}
        onRetomar={vi.fn()}
        onEncerrar={vi.fn()}
        onConcluirCompromisso={vi.fn()}
      />,
    );
    expect(screen.getByText(`Parou no Dia 1 — ${PME[0].title}`)).toBeTruthy();
    expect(screen.getByText("há 5 dias")).toBeTruthy();
    expect(screen.getByText("2 toques vencidos")).toBeTruthy();
  });
});
