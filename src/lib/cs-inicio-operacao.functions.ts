import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAVE_INICIO_OPERACAO, lerInicioOperacao } from "@/lib/cs/inicio-operacao";

/** Dia 1 do CS: a data a partir da qual os prazos e atrasos contam. */
export const lerInicioOperacaoCs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getCsSetting } = await import("@/lib/cs/cs-core.server");
    return {
      data: lerInicioOperacao(
        await getCsSetting<unknown>(context.supabase, CHAVE_INICIO_OPERACAO, null),
      ),
    };
  });

export const salvarInicioOperacaoCs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        data: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gestor } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!gestor) throw new Error("Só a gestão muda o início da operação do CS");
    const { saveCsSetting } = await import("@/lib/cs/cs-core.server");
    await saveCsSetting(supabase, CHAVE_INICIO_OPERACAO, { data: data.data ?? "" });
    // Escalações já abertas são recalculadas com a nova data.
    await supabase.rpc("cs_refresh_escalations" as never);
    return { ok: true };
  });
