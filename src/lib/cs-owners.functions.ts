import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Remove acentos e normaliza espaços para comparar nomes da planilha com os profiles. */
function normName(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** nome.sobrenome@grougp.com.br (usa primeiro e último nome). */
function emailFor(name: string) {
  const parts = normName(name).split(" ").filter(Boolean);
  const slug = parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`;
  return `${slug.replace(/[^a-z.]/g, "")}@grougp.com.br`;
}

/** Nome em Title Case para o profile. */
function titleCase(name: string) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Cria os usuários de CS/comercial que aparecem nos cards (planilha da sinaleira)
 * e ainda não existem no sistema, e vincula os clientes a eles.
 */
export const syncCsOwners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dryRun: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão pode sincronizar responsáveis");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchAllRows } = await import("@/lib/cs/cs-core.server");

    // Semana mais recente sincronizada
    const { data: last } = await supabaseAdmin
      .from("cs_signal_snapshots")
      .select("week_start")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    const weekStart = last?.week_start as string | undefined;
    if (!weekStart) throw new Error("Nenhuma sinaleira sincronizada ainda");

    const snaps = await fetchAllRows<{ client_uid: string; metadata: unknown }>((f, t) =>
      supabaseAdmin
        .from("cs_signal_snapshots")
        .select("client_uid, metadata")
        .eq("week_start", weekStart)
        .range(f, t) as never,
    );

    // Nomes distintos que aparecem nos cards
    const wanted = new Map<string, string>(); // norm -> nome original
    const perClient: Array<{ client_uid: string; cs: string | null; com: string | null }> = [];
    for (const s of snaps) {
      const meta = (s.metadata && typeof s.metadata === "object" ? s.metadata : {}) as Record<string, unknown>;
      const cs = String(meta["cs_atendimento"] ?? "").trim() || null;
      const com = String(meta["responsavel"] ?? "").trim() || null;
      for (const n of [cs, com]) if (n && !wanted.has(normName(n))) wanted.set(normName(n), n);
      perClient.push({ client_uid: s.client_uid, cs, com });
    }

    // Profiles existentes
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name, email");
    const byName = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.full_name) byName.set(normName(p.full_name as string), p.id as string);
      if (p.email) byName.set(normName((p.email as string).split("@")[0].replace(/[._]/g, " ")), p.id as string);
    }

    const created: Array<{ name: string; email: string }> = [];
    for (const [key, name] of wanted) {
      if (byName.has(key)) continue;
      const email = emailFor(name);
      if (data.dryRun) {
        created.push({ name: titleCase(name), email });
        continue;
      }
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID().slice(0, 12) + "Aa1!",
        user_metadata: { full_name: titleCase(name) },
      });
      if (error || !newUser.user) {
        // Já existe no auth: recupera pelo profile
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (existing?.id) byName.set(key, existing.id as string);
        continue;
      }
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: newUser.user.id, email, full_name: titleCase(name) } as never);
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: newUser.user.id, role: "executivo" } as never, {
          onConflict: "user_id,role",
        });
      byName.set(key, newUser.user.id);
      created.push({ name: titleCase(name), email });
    }

    if (data.dryRun) {
      return { weekStart, created, linked: 0, dryRun: true as const };
    }

    // Vincula os clientes
    let linked = 0;
    const CONCURRENCY = 12;
    for (let i = 0; i < perClient.length; i += CONCURRENCY) {
      await Promise.all(
        perClient.slice(i, i + CONCURRENCY).map(async (r) => {
          const patch: Record<string, string> = {};
          const csId = r.cs ? byName.get(normName(r.cs)) : undefined;
          const comId = r.com ? byName.get(normName(r.com)) : undefined;
          if (csId) patch["cs_responsavel_id"] = csId;
          if (comId) patch["comercial_responsavel_id"] = comId;
          if (Object.keys(patch).length === 0) return;
          const { error } = await supabaseAdmin
            .from("cs_clients")
            .update(patch as never)
            .eq("client_uid", r.client_uid);
          if (!error) linked++;
        }),
      );
    }

    return { weekStart, created, linked, dryRun: false as const };
  });
