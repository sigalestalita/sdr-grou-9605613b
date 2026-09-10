import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { modulesFromMemberships, type AppTeam, type Membership, type Team } from "@/lib/teams";

const TALITA_EMAIL = "talita.sigales@grougp.com.br";

const MembershipSchema = z.object({
  team: z.string().min(1).max(60),
  access: z.array(z.string().min(1).max(30)).min(1),
});

const TeamInputSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Identificador: letras minúsculas, números e hífen")
    .optional(),
  nome: z.string().trim().min(2).max(80),
  descricao: z.string().trim().max(300).optional().nullable(),
  modulo: z.enum(["comercial", "cs"]).nullable(),
  cor: z
    .string()
    .regex(/^[a-z]+$/)
    .max(20),
  ativo: z.boolean().optional(),
});

async function getCallerRole(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as string);
  return {
    isSuperAdmin: roles.includes("super_admin"),
    isGestao: roles.includes("gestao"),
    roles,
  };
}

async function requireSuperAdmin(userId: string, what: string) {
  const caller = await getCallerRole(userId);
  if (!caller.isSuperAdmin) throw new Error(`Apenas super admin pode ${what}`);
  return caller;
}

async function loadTeams(): Promise<Team[]> {
  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("slug, nome, descricao, modulo, cor, ativo, ordem")
    .order("ordem")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    slug: t.slug as string,
    nome: t.nome as string,
    descricao: (t.descricao as string | null) ?? null,
    modulo: (t.modulo as AppTeam | null) ?? null,
    cor: (t.cor as string) ?? "slate",
    ativo: !!t.ativo,
    ordem: (t.ordem as number) ?? 100,
  }));
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await getCallerRole(context.userId);
    if (!caller.isSuperAdmin && !caller.isGestao) throw new Error("Acesso negado");

    const [
      { data: profiles, error: pErr },
      { data: roles, error: rErr },
      { data: links, error: tErr },
      teams,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, created_at").order("full_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("user_teams").select("user_id, team, access"),
      loadTeams(),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (tErr) throw new Error(tErr.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id as string) ?? [];
      list.push(r.role as string);
      rolesByUser.set(r.user_id as string, list);
    }
    const membershipsByUser = new Map<string, Membership[]>();
    for (const l of links ?? []) {
      const list = membershipsByUser.get(l.user_id as string) ?? [];
      list.push({ team: l.team as string, access: (l.access as string[]) ?? [] });
      membershipsByUser.set(l.user_id as string, list);
    }

    return {
      canEdit: caller.isSuperAdmin,
      currentUserId: context.userId,
      teams,
      users: (profiles ?? []).map((p) => {
        const userRoles = rolesByUser.get(p.id as string) ?? [];
        const memberships = membershipsByUser.get(p.id as string) ?? [];
        return {
          id: p.id as string,
          email: (p.email as string) ?? "",
          full_name: (p.full_name as string) ?? "",
          created_at: p.created_at as string,
          roles: userRoles,
          isSuperAdmin: userRoles.includes("super_admin"),
          isGestao: userRoles.includes("gestao"),
          memberships,
          modules: modulesFromMemberships(memberships, teams),
        };
      }),
    };
  });

export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => loadTeams());

// ---------------------------------------------------------------------------
// Times / áreas
// ---------------------------------------------------------------------------
export const saveTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TeamInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "cadastrar times");
    const slug = data.slug ?? slugify(data.nome);
    if (slug.length < 2) throw new Error("Nome muito curto para gerar o identificador");

    const { data: existing } = await supabaseAdmin
      .from("teams")
      .select("slug, modulo")
      .eq("slug", slug)
      .maybeSingle();

    if (existing && data.slug === undefined) {
      throw new Error(`Já existe um time com o identificador "${slug}"`);
    }
    // Trocar o módulo de um time com gente dentro invalidaria os tipos de acesso.
    if (existing && (existing.modulo ?? null) !== data.modulo) {
      const { count } = await supabaseAdmin
        .from("user_teams")
        .select("id", { count: "exact", head: true })
        .eq("team", slug);
      if ((count ?? 0) > 0)
        throw new Error("Remova as pessoas do time antes de trocar o módulo dele");
    }

    const row = {
      slug,
      nome: data.nome,
      descricao: data.descricao ?? null,
      modulo: data.modulo,
      cor: data.cor,
      ativo: data.ativo ?? true,
      updated_at: new Date().toISOString(),
      ...(existing ? {} : { created_by: context.userId }),
    };
    const { error } = await supabaseAdmin
      .from("teams")
      .upsert(row as never, { onConflict: "slug" });
    if (error) throw new Error(error.message);
    return { ok: true, slug };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "excluir times");
    if (data.slug === "comercial" || data.slug === "cs")
      throw new Error("Os times Comercial e Customer Success são padrão do sistema");
    const { count } = await supabaseAdmin
      .from("user_teams")
      .select("id", { count: "exact", head: true })
      .eq("team", data.slug);
    if ((count ?? 0) > 0) throw new Error("Tire as pessoas do time antes de excluí-lo");
    const { error } = await supabaseAdmin.from("teams").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Pessoas: vínculos e tipos de acesso
// ---------------------------------------------------------------------------
async function replaceMemberships(userId: string, memberships: Membership[]) {
  const { error: delErr } = await supabaseAdmin.from("user_teams").delete().eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  if (memberships.length === 0) {
    // sem vínculo o trigger não roda: zera os papéis derivados na mão
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .neq("role", "super_admin");
    if (error) throw new Error(error.message);
    return;
  }
  const { error: insErr } = await supabaseAdmin.from("user_teams").insert(
    memberships.map((m) => ({
      user_id: userId,
      team: m.team,
      access: [...new Set(m.access)],
    })) as never[],
  );
  if (insErr) throw new Error(insErr.message);
}

export const setUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), memberships: z.array(MembershipSchema) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "alterar acessos");
    await replaceMemberships(data.userId, data.memberships);
    return { ok: true };
  });

export const setSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), on: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "alterar super admins");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.email && (target.email as string).toLowerCase() === TALITA_EMAIL && !data.on) {
      throw new Error("Não é permitido rebaixar a super admin principal");
    }
    if (data.userId === context.userId && !data.on)
      throw new Error("Você não pode tirar o próprio super admin");
    if (data.on) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "super_admin" } as never, {
          onConflict: "user_id,role",
        });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "super_admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/**
 * Cria a conta pela administração: e-mail de qualquer domínio (a conta nasce
 * confirmada), com os vínculos escolhidos. Sem senha informada, envia o e-mail
 * para a pessoa definir a própria.
 */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email(),
        fullName: z.string().trim().min(2).max(120),
        password: z.string().min(8).max(72).optional(),
        memberships: z.array(MembershipSchema),
        redirectTo: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "cadastrar usuários");
    const email = data.email.toLowerCase();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: data.password ?? crypto.randomUUID() + "Aa1!",
      user_metadata: { full_name: data.fullName },
      app_metadata: { admin_created: "true" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar a conta");

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: created.user.id, email, full_name: data.fullName } as never);
    if (pErr) throw new Error(pErr.message);

    await replaceMemberships(created.user.id, data.memberships);

    let inviteSent = false;
    if (!data.password) {
      const { error: rErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: data.redirectTo,
      });
      inviteSent = !rErr;
    }
    return { ok: true, userId: created.user.id, inviteSent };
  });

export const removeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "remover usuários");
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.email && (target.email as string).toLowerCase() === TALITA_EMAIL) {
      throw new Error("Não é permitido remover a super admin principal");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Quem sou eu (menu, rotas, landing)
// ---------------------------------------------------------------------------
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data, error }, { data: linkRows, error: tErr }, { data: teamRows, error: teamErr }] =
      await Promise.all([
        context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
        context.supabase.from("user_teams").select("team, access").eq("user_id", context.userId),
        context.supabase.from("teams").select("slug, nome, modulo, cor, ativo, ordem, descricao"),
      ]);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);

    // Migration de times ainda não aplicada: vale o modelo antigo (time = módulo).
    if (tErr || teamErr) {
      const { data: legacy, error: lErr } = await context.supabase
        .from("user_teams")
        .select("team")
        .eq("user_id", context.userId);
      if (lErr) throw new Error(lErr.message);
      const legacyTeams = (legacy ?? []).map((t) => t.team as string);
      return {
        roles,
        role: roles[0] ?? null,
        isSuperAdmin: roles.includes("super_admin"),
        isGestao: roles.includes("gestao"),
        teams: legacyTeams.filter((t): t is AppTeam => t === "comercial" || t === "cs"),
        memberships: legacyTeams.map((team) => ({ team, access: [] as string[] })),
      };
    }

    const memberships: Membership[] = (linkRows ?? []).map((t) => ({
      team: t.team as string,
      access: ((t as { access?: string[] }).access ?? []) as string[],
    }));
    const teams: Team[] = (teamRows ?? []).map((t) => ({
      slug: t.slug as string,
      nome: t.nome as string,
      descricao: (t.descricao as string | null) ?? null,
      modulo: (t.modulo as AppTeam | null) ?? null,
      cor: (t.cor as string) ?? "slate",
      ativo: !!t.ativo,
      ordem: (t.ordem as number) ?? 100,
    }));

    return {
      roles,
      role: roles[0] ?? null,
      isSuperAdmin: roles.includes("super_admin"),
      isGestao: roles.includes("gestao"),
      /** Módulos liberados (comercial = SDR, cs = Customer Success). */
      teams: modulesFromMemberships(memberships, teams),
      memberships,
    };
  });

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "alterar senhas");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendUserPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), redirectTo: z.string().url() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireSuperAdmin(context.userId, "enviar redefinição");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    const email = target?.email as string | undefined;
    if (!email) throw new Error("Usuário sem email cadastrado");

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true, email };
  });
