import { describe, expect, it } from "vitest";
import { lerCoexistencia, metaCloudProvider } from "./meta-cloud-provider.server";
import { escolherContaDaDona, type ContaCandidata } from "./conta-da-dona";
import { agruparPorContato, statusDoEspelho } from "./espelho.server";
import type { WaMirroredMessage } from "./provider-types";

const META_NUMERO = { display_phone_number: "5551926361637", phone_number_id: "1359681753903992" };

describe("lerCoexistencia", () => {
  it("lê o eco do que a SDR digitou no celular (formato real recebido)", () => {
    const [ev] = lerCoexistencia("smb_message_echoes", {
      metadata: META_NUMERO,
      message_echoes: [
        {
          id: "wamid.ECO1",
          to: "5551926344839",
          from: "5551926361637",
          text: { body: "Olá! Quero mais informações" },
          type: "text",
          timestamp: "1789739131",
        },
      ],
    });
    expect(ev.kind).toBe("mirror");
    if (ev.kind !== "mirror") return;
    expect(ev.data.contactPhone).toBe("5551926344839");
    expect(ev.data.fromBusiness).toBe(true);
    expect(ev.data.origem).toBe("echo");
    expect(ev.data.body).toBe("Olá! Quero mais informações");
    expect(ev.data.toPhoneNumberId).toBe("1359681753903992");
    expect(ev.data.timestamp).toBe(1789739131000);
  });

  it("separa no histórico o que a empresa mandou do que o contato mandou", () => {
    const evs = lerCoexistencia("history", {
      metadata: META_NUMERO,
      history: [
        {
          threads: [
            {
              id: "5511999990000",
              messages: [
                {
                  id: "wamid.H1",
                  from: "5511999990000",
                  timestamp: "1780000000",
                  type: "text",
                  text: { body: "Oi, tudo bem?" },
                  history_context: { status: "READ" },
                },
                {
                  id: "wamid.H2",
                  from: "5551926361637",
                  to: "5511999990000",
                  timestamp: "1780000100",
                  type: "image",
                  image: { id: "MID", mime_type: "image/jpeg", caption: "proposta" },
                  history_context: { status: "DELIVERED" },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(2);
    const [doContato, daEmpresa] = evs.map((e) => (e.kind === "mirror" ? e.data : null));
    expect(doContato?.fromBusiness).toBe(false);
    expect(doContato?.contactPhone).toBe("5511999990000");
    expect(daEmpresa?.fromBusiness).toBe(true);
    expect(daEmpresa?.contactPhone).toBe("5511999990000");
    expect(daEmpresa?.type).toBe("image");
    expect(daEmpresa?.mediaId).toBe("MID");
    expect(daEmpresa?.historyStatus).toBe("DELIVERED");
  });

  it("lê o contato da agenda do app (formato real recebido)", () => {
    const [ev] = lerCoexistencia("smb_app_state_sync", {
      metadata: META_NUMERO,
      state_sync: [
        {
          type: "contact",
          action: "add",
          contact: { full_name: "Talita Gonçalves", phone_number: "555199969371" },
        },
      ],
    });
    expect(ev).toEqual({
      kind: "contact_sync",
      data: {
        phone: "555199969371",
        name: "Talita Gonçalves",
        action: "add",
        toPhoneNumberId: "1359681753903992",
      },
    });
  });

  it("formato desconhecido continua indo para o diagnóstico", () => {
    const corpo = JSON.stringify({
      entry: [{ changes: [{ field: "history", value: { history: [{ errors: [{ code: 1 }] }] } }] }],
    });
    const evs = metaCloudProvider.parseWebhook(corpo, {}, {} as never);
    expect(evs).toEqual([{ kind: "unknown", field: "history", value: expect.anything() }]);
  });
});

describe("escolherContaDaDona", () => {
  const padrao: ContaCandidata = {
    id: "grou",
    provider: "meta_cloud",
    status: "active",
    owner_user_id: "gestora",
    espelhada: false,
    is_default: true,
    access_token: "t",
    provider_instance_id: "1",
    metadata: { waba_id: "WABA_GROU" },
  };
  const daCamila: ContaCandidata = {
    id: "camila",
    provider: "meta_cloud",
    status: "connected",
    owner_user_id: "camila",
    espelhada: true,
    access_token: "t",
    provider_instance_id: "2",
    metadata: { waba_id: "WABA_GROU", coexistencia: true },
  };

  it("usa o número da dona quando está no mesmo WABA da conta padrão", () => {
    expect(escolherContaDaDona([daCamila], "camila", padrao)?.id).toBe("camila");
  });

  it("ignora número de outro WABA: o template não existiria lá", () => {
    const outroWaba = { ...daCamila, metadata: { waba_id: "OUTRO" } };
    expect(escolherContaDaDona([outroWaba], "camila", padrao)).toBeNull();
  });

  it("ignora conta que não é espelhada, desligada ou de outra pessoa", () => {
    expect(escolherContaDaDona([{ ...daCamila, espelhada: false }], "camila", padrao)).toBeNull();
    expect(escolherContaDaDona([{ ...daCamila, status: "disabled" }], "camila", padrao)).toBeNull();
    expect(escolherContaDaDona([daCamila], "lisiane", padrao)).toBeNull();
    expect(escolherContaDaDona([daCamila], null, padrao)).toBeNull();
  });
});

describe("espelho", () => {
  const base: WaMirroredMessage = {
    providerMessageId: "x",
    from: "",
    to: "",
    type: "text",
    timestamp: 0,
    contactPhone: "55",
    fromBusiness: true,
    origem: "history",
  };

  it("traduz o status do histórico e trata a mensagem do contato como entregue", () => {
    expect(statusDoEspelho({ ...base, historyStatus: "READ" })).toBe("read");
    expect(statusDoEspelho({ ...base, historyStatus: "DELIVERED" })).toBe("delivered");
    expect(statusDoEspelho({ ...base })).toBe("sent");
    expect(statusDoEspelho({ ...base, fromBusiness: false, historyStatus: "READ" })).toBe(
      "delivered",
    );
  });

  it("agrupa por contato e põe cada conversa em ordem de tempo", () => {
    const grupos = agruparPorContato([
      { ...base, providerMessageId: "b", contactPhone: "A", timestamp: 2 },
      { ...base, providerMessageId: "c", contactPhone: "B", timestamp: 1 },
      { ...base, providerMessageId: "a", contactPhone: "A", timestamp: 1 },
    ]);
    expect([...grupos.keys()]).toEqual(["A", "B"]);
    expect(grupos.get("A")?.map((m) => m.providerMessageId)).toEqual(["a", "b"]);
  });
});
