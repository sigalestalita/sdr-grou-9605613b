import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* Descadastro pelo link do e-mail (página pública, sem login). */
const tokenZ = z.object({ t: z.string().regex(/^[a-f0-9]{32}$/) });

export const verDescadastro = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenZ.parse(d))
  .handler(async ({ data }) => {
    const { envioPorToken } = await import("@/lib/email-marketing/rastreio.server");
    const e = await envioPorToken(data.t);
    if (!e) return { valido: false as const };
    const [u, dom] = e.email.split("@");
    return {
      valido: true as const,
      // Mostra só parte do e-mail (o link pode ser repassado).
      email: `${u.slice(0, 2)}•••@${dom}`,
      jaDescadastrado: !!e.descadastrou_em,
    };
  });

export const confirmarDescadastro = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenZ.extend({ motivo: z.string().max(300).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { descadastrar } = await import("@/lib/email-marketing/rastreio.server");
    const r = await descadastrar(data.t, data.motivo);
    return { ok: r.ok };
  });
