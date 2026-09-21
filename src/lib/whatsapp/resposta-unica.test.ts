import { describe, expect, it } from "vitest";
import { decidirResposta } from "./resposta-unica";

const t = (min: number) => new Date(Date.UTC(2026, 8, 21, 17, min, 0)).toISOString();
const agora = new Date(Date.UTC(2026, 8, 21, 17, 50, 0)).getTime();

describe("decidirResposta", () => {
  it("responde a mensagem do lead que ainda não teve resposta", () => {
    const d = decidirResposta(
      [{ sender_type: "lead", provider_message_id: "wamid.A", created_at: t(48) }],
      "wamid.A",
      agora,
    );
    expect(d.responder).toBe(true);
  });

  it("cala a execução antiga quando já chegou mensagem mais nova", () => {
    const mensagens = [
      { sender_type: "lead", provider_message_id: "wamid.A", created_at: t(48) },
      { sender_type: "lead", provider_message_id: "wamid.B", created_at: t(49) },
    ];
    expect(decidirResposta(mensagens, "wamid.A", agora).responder).toBe(false);
    expect(decidirResposta(mensagens, "wamid.B", agora).responder).toBe(true);
  });

  it("não responde de novo o que já foi respondido", () => {
    const d = decidirResposta(
      [
        { sender_type: "lead", provider_message_id: "wamid.A", created_at: t(48) },
        { sender_type: "bot", created_at: t(49) },
      ],
      "wamid.A",
      agora,
    );
    expect(d.responder).toBe(false);
    expect(d.motivo).toContain("já foi respondida");
  });

  it("segura duas respostas coladas mesmo com mensagem nova do lead", () => {
    const quase = new Date(agora - 5_000).toISOString();
    const d = decidirResposta(
      [
        { sender_type: "bot", created_at: quase },
        {
          sender_type: "lead",
          provider_message_id: "wamid.C",
          created_at: new Date(agora - 1_000).toISOString(),
        },
      ],
      "wamid.C",
      agora,
    );
    expect(d.responder).toBe(false);
    expect(d.motivo).toContain("acabou de responder");
  });

  it("volta a responder depois do descanso", () => {
    const d = decidirResposta(
      [
        { sender_type: "bot", created_at: new Date(agora - 120_000).toISOString() },
        {
          sender_type: "lead",
          provider_message_id: "wamid.C",
          created_at: new Date(agora - 60_000).toISOString(),
        },
      ],
      "wamid.C",
      agora,
    );
    expect(d.responder).toBe(true);
  });

  it("resposta de gente também conta como respondida, sem descanso", () => {
    const d = decidirResposta(
      [
        { sender_type: "lead", provider_message_id: "wamid.A", created_at: t(48) },
        { sender_type: "sdr", created_at: t(49) },
      ],
      "wamid.A",
      agora,
    );
    expect(d.responder).toBe(false);
  });

  it("sem mensagem do lead, não responde", () => {
    expect(decidirResposta([], "wamid.A", agora).responder).toBe(false);
    expect(
      decidirResposta([{ sender_type: "bot", created_at: t(40) }], "wamid.A", agora).responder,
    ).toBe(false);
  });
});
