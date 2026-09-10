import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  createUser,
  deleteTeam,
  listUsers,
  removeUser,
  saveTeam,
  sendUserPasswordReset,
  setSuperAdmin,
  setUserAccess,
  setUserPassword,
} from "@/lib/users.functions";
import {
  accessLabel,
  accessTypesFor,
  MODULE_OPTIONS,
  TEAM_COLORS,
  TEAM_LABEL,
  teamChipClass,
  type AppTeam,
  type Membership,
  type Team,
} from "@/lib/teams";
import { useCurrentRole } from "@/lib/use-role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/usuarios")({
  head: () => ({ meta: [{ title: "Usuários e times — Grou Compass" }] }),
  component: UsersPage,
});

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  roles: string[];
  isSuperAdmin: boolean;
  isGestao: boolean;
  memberships: Membership[];
  modules: AppTeam[];
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro");

function ModuleBadge({ modulo }: { modulo: AppTeam | null }) {
  if (!modulo) return <Badge variant="outline">Área de apoio</Badge>;
  return <Badge variant="outline">{TEAM_LABEL[modulo]}</Badge>;
}

/** Resumo do que a pessoa enxerga, a partir dos vínculos. */
function accessSummary(u: UserRow): string {
  if (u.isSuperAdmin) return "Tudo (super admin)";
  if (u.isGestao) return "Tudo (gestão)";
  const parts: string[] = [];
  if (u.modules.includes("comercial")) parts.push("SDR");
  if (u.roles.includes("executivo")) parts.push("Comercial");
  if (u.modules.includes("cs")) parts.push("CS");
  return parts.length ? parts.join(" + ") : "Nenhum módulo";
}

function UsersPage() {
  const { isSuperAdmin, isGestao, loading: roleLoading } = useCurrentRole();
  const listFn = useServerFn(listUsers);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => listFn(),
    enabled: !roleLoading && (isSuperAdmin || isGestao),
  });

  const [teamDialog, setTeamDialog] = useState<{ team: Team | null } | null>(null);
  const [accessTarget, setAccessTarget] = useState<UserRow | null>(null);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<{ id: string; email: string } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users-list"] });
    qc.invalidateQueries({ queryKey: ["my-role"] });
  };

  const removeFn = useServerFn(removeUser);
  const remove = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário removido");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const superFn = useServerFn(setSuperAdmin);
  const toggleSuper = useMutation({
    mutationFn: (v: { userId: string; on: boolean }) => superFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.on ? "Agora é super admin" : "Deixou de ser super admin");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (roleLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!isSuperAdmin && !isGestao) {
    return (
      <div className="max-w-2xl p-8">
        <Card className="space-y-2 p-6">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para gerenciar usuários.
          </p>
        </Card>
      </div>
    );
  }

  const canEdit = !!data?.canEdit;
  const teams = data?.teams ?? [];
  const activeTeams = teams.filter((t) => t.ativo);
  const membersByTeam = new Map<string, number>();
  for (const u of data?.users ?? [])
    for (const m of u.memberships) membersByTeam.set(m.team, (membersByTeam.get(m.team) ?? 0) + 1);
  const teamBySlug = new Map(teams.map((t) => [t.slug, t]));

  return (
    <div className="max-w-6xl space-y-6 p-6">
      <Link
        to="/configuracoes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar para Configurações
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuários e times</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cadastre os times/áreas da Grou, as pessoas de cada um e o tipo de acesso de cada pessoa
            no time. Uma pessoa pode estar em mais de um time com tipos diferentes — por exemplo,
            analista de CS e executiva comercial, sem ver o módulo SDR.
          </p>
        </div>
        {!canEdit && <Badge variant="outline">Somente leitura — só super admin pode editar</Badge>}
      </div>

      {/* ---------------- Times / áreas ---------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            Times e áreas
          </h2>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setTeamDialog({ team: null })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Novo time
            </Button>
          )}
        </div>
        {isLoading || !data ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => {
              const n = membersByTeam.get(t.slug) ?? 0;
              return (
                <Card
                  key={t.slug}
                  className={`flex flex-col gap-2 p-4 ${t.ativo ? "" : "opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${TEAM_COLORS[t.cor]?.dot ?? TEAM_COLORS.slate.dot}`}
                      />
                      <p className="font-semibold leading-tight">{t.nome}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Editar time"
                        onClick={() => setTeamDialog({ team: t })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ModuleBadge modulo={t.modulo} />
                    {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  {t.descricao && (
                    <p className="text-xs leading-relaxed text-muted-foreground">{t.descricao}</p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {accessTypesFor(t).map((a) => (
                      <span
                        key={a.value}
                        className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        title={a.hint}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {n === 0 ? "Ninguém ainda" : n === 1 ? "1 pessoa" : `${n} pessoas`}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------- Pessoas ---------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Pessoas</h2>
          {canEdit && (
            <Button size="sm" onClick={() => setNewUserOpen(true)}>
              <UserPlus className="mr-1 h-3.5 w-3.5" /> Novo usuário
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Quem se cadastra pela tela de entrada (só e-mails <strong>@grougp.com.br</strong>) entra
          no time que escolheu, com o acesso básico. Contas de outros domínios só pela
          administração. <strong>Gestão</strong> em qualquer time e <strong>super admin</strong>{" "}
          enxergam todos os módulos.
        </p>

        {isLoading || !data ? (
          <div className="p-8 text-sm text-muted-foreground">Carregando usuários…</div>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.03] text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Pessoa</th>
                    <th className="p-3 text-left">Times e tipos de acesso</th>
                    <th className="p-3 text-left">Enxerga</th>
                    <th className="p-3 text-left">Super admin</th>
                    <th className="p-3 text-left">Desde</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => {
                    const isTalita = u.email.toLowerCase() === "talita.sigales@grougp.com.br";
                    const isSelf = u.id === data.currentUserId;
                    return (
                      <tr key={u.id} className="border-t border-white/5 align-top">
                        <td className="p-3">
                          <p className="font-medium">{u.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {u.memberships.map((m) => {
                              const t = teamBySlug.get(m.team);
                              return (
                                <span
                                  key={m.team}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                    t ? teamChipClass(t) : "border-border text-muted-foreground"
                                  }`}
                                >
                                  {t?.nome ?? m.team}
                                  <span className="opacity-70">
                                    · {m.access.map(accessLabel).join(", ")}
                                  </span>
                                </span>
                              );
                            })}
                            {u.memberships.length === 0 && !u.isSuperAdmin && (
                              <span className="text-[11px] text-amber-500">sem time</span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => setAccessTarget(u)}
                              >
                                <Pencil className="mr-1 inline h-3 w-3" />
                                editar
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{accessSummary(u)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={u.isSuperAdmin}
                              disabled={!canEdit || isTalita || toggleSuper.isPending}
                              onCheckedChange={(on) => {
                                if (
                                  on ||
                                  confirm(`Tirar o super admin de ${u.full_name || u.email}?`)
                                )
                                  toggleSuper.mutate({ userId: u.id, on });
                              }}
                              aria-label="Super admin"
                            />
                            {u.isSuperAdmin && (
                              <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mr-2"
                              onClick={() => setPwdTarget({ id: u.id, email: u.email })}
                            >
                              <KeyRound className="mr-1 h-3 w-3" /> Senha
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canEdit || isTalita || isSelf}
                            onClick={() => {
                              if (confirm(`Remover ${u.email}? Essa ação não pode ser desfeita.`))
                                remove.mutate(u.id);
                            }}
                          >
                            Remover
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {teamDialog && (
        <TeamDialog
          team={teamDialog.team}
          members={teamDialog.team ? (membersByTeam.get(teamDialog.team.slug) ?? 0) : 0}
          onClose={() => setTeamDialog(null)}
          onSaved={invalidate}
        />
      )}
      {accessTarget && (
        <AccessDialog
          user={accessTarget}
          teams={activeTeams}
          onClose={() => setAccessTarget(null)}
          onSaved={invalidate}
        />
      )}
      {newUserOpen && (
        <NewUserDialog
          teams={activeTeams}
          onClose={() => setNewUserOpen(false)}
          onSaved={invalidate}
        />
      )}
      <PasswordDialog target={pwdTarget} onClose={() => setPwdTarget(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor de vínculos (usado no "editar acessos" e no "novo usuário")
// ---------------------------------------------------------------------------
function MembershipEditor({
  teams,
  value,
  onChange,
}: {
  teams: Team[];
  value: Membership[];
  onChange: (next: Membership[]) => void;
}) {
  const bySlug = new Map(value.map((m) => [m.team, m.access]));
  const toggle = (team: string, access: string, on: boolean) => {
    const cur = new Set(bySlug.get(team) ?? []);
    if (on) cur.add(access);
    else cur.delete(access);
    const next = value.filter((m) => m.team !== team);
    if (cur.size) next.push({ team, access: [...cur] });
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {teams.map((t) => {
        const selected = bySlug.get(t.slug) ?? [];
        return (
          <div
            key={t.slug}
            className={`rounded-lg border p-3 ${selected.length ? teamChipClass(t) : "border-border"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t.nome}</p>
              <ModuleBadge modulo={t.modulo} />
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {accessTypesFor(t).map((a) => {
                const id = `acc-${t.slug}-${a.value}`;
                const on = selected.includes(a.value);
                return (
                  <label
                    key={a.value}
                    htmlFor={id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-foreground"
                  >
                    <Checkbox
                      id={id}
                      checked={on}
                      onCheckedChange={(c) => toggle(t.slug, a.value, c === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-sm font-medium">{a.label}</span>
                      <span className="block text-[11px] leading-snug opacity-75">{a.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AccessDialog({
  user,
  teams,
  onClose,
  onSaved,
}: {
  user: UserRow;
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(setUserAccess);
  const [memberships, setMemberships] = useState<Membership[]>(user.memberships);
  const save = useMutation({
    mutationFn: () => fn({ data: { userId: user.id, memberships } }),
    onSuccess: () => {
      toast.success("Acessos atualizados");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Acessos de {user.full_name || user.email}</DialogTitle>
          <DialogDescription>
            Marque em cada time o que essa pessoa faz. Sem nada marcado num time, ela sai dele.
          </DialogDescription>
        </DialogHeader>
        <MembershipEditor teams={teams} value={memberships} onChange={setMemberships} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar acessos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Novo usuário
// ---------------------------------------------------------------------------
function NewUserDialog({
  teams,
  onClose,
  onSaved,
}: {
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fn = useServerFn(createUser);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const save = useMutation({
    mutationFn: () =>
      fn({
        data: {
          fullName,
          email,
          password: password || undefined,
          memberships,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.inviteSent
          ? "Conta criada — enviamos o e-mail para a pessoa definir a senha"
          : "Conta criada",
      );
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const valid =
    fullName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email) &&
    (password === "" || password.length >= 8);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            A conta nasce confirmada. Sem senha, a pessoa recebe um e-mail para definir a dela.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nu-name">Nome completo</Label>
              <Input id="nu-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nu-email">E-mail</Label>
              <Input
                id="nu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@grougp.com.br"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nu-pwd">Senha inicial (opcional)</Label>
            <Input
              id="nu-pwd"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres — ou deixe em branco para enviar o e-mail"
            />
          </div>
          <div className="space-y-1">
            <Label>Times e tipos de acesso</Label>
            <MembershipEditor teams={teams} value={memberships} onChange={setMemberships} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? "Criando…" : "Criar conta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Time / área
// ---------------------------------------------------------------------------
function TeamDialog({
  team,
  members,
  onClose,
  onSaved,
}: {
  team: Team | null;
  members: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveTeam);
  const delFn = useServerFn(deleteTeam);
  const [nome, setNome] = useState(team?.nome ?? "");
  const [descricao, setDescricao] = useState(team?.descricao ?? "");
  const [modulo, setModulo] = useState<AppTeam | "none">(team?.modulo ?? "none");
  const [cor, setCor] = useState(team?.cor ?? "violet");
  const [ativo, setAtivo] = useState(team?.ativo ?? true);
  const isDefault = team?.slug === "comercial" || team?.slug === "cs";

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          slug: team?.slug,
          nome,
          descricao: descricao || null,
          modulo: modulo === "none" ? null : modulo,
          cor,
          ativo,
        },
      }),
    onSuccess: () => {
      toast.success(team ? "Time atualizado" : "Time criado");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { slug: team!.slug } }),
    onSuccess: () => {
      toast.success("Time excluído");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const moduleLocked = !!team && members > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? `Editar ${team.nome}` : "Novo time ou área"}</DialogTitle>
          <DialogDescription>
            O módulo define o que as pessoas do time enxergam e quais tipos de acesso existem nele.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="t-nome">Nome</Label>
            <Input
              id="t-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: CS Enterprise, Marketing, Financeiro"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-desc">Descrição</Label>
            <Textarea
              id="t-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que esse time faz"
            />
          </div>
          <div className="space-y-1">
            <Label>Módulo do sistema</Label>
            <Select
              value={modulo}
              onValueChange={(v) => setModulo(v as AppTeam | "none")}
              disabled={isDefault || moduleLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label} — <span className="text-muted-foreground">{o.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {moduleLocked && !isDefault && (
              <p className="text-[11px] text-muted-foreground">
                Para trocar o módulo, tire as pessoas do time primeiro.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TEAM_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  title={c.label}
                  onClick={() => setCor(key)}
                  className={`h-7 w-7 rounded-full ${c.dot} ring-offset-2 ring-offset-background transition ${
                    cor === key ? "ring-2 ring-foreground/70" : "opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
          {team && !isDefault && (
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>
                Time ativo
                <span className="block text-[11px] text-muted-foreground">
                  Inativo: some das opções e deixa de liberar módulo
                </span>
              </span>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </label>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {team && !isDefault ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={members > 0 || del.isPending}
              title={members > 0 ? "Tire as pessoas do time antes" : undefined}
              onClick={() => confirm(`Excluir o time ${team.nome}?`) && del.mutate()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={nome.trim().length < 2 || save.isPending}
            >
              {save.isPending ? "Salvando…" : team ? "Salvar" : "Criar time"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------
function PasswordDialog({
  target,
  onClose,
}: {
  target: { id: string; email: string } | null;
  onClose: () => void;
}) {
  const setPasswordFn = useServerFn(setUserPassword);
  const sendResetFn = useServerFn(sendUserPasswordReset);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const key = target?.id ?? "";
  // limpa os campos ao trocar de pessoa
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setNewPassword("");
    setConfirmPassword("");
  }

  const savePassword = useMutation({
    mutationFn: (v: { userId: string; password: string }) => setPasswordFn({ data: v }),
    onSuccess: () => {
      toast.success("Senha atualizada");
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const sendReset = useMutation({
    mutationFn: (userId: string) =>
      sendResetFn({ data: { userId, redirectTo: `${window.location.origin}/reset-password` } }),
    onSuccess: () => toast.success("Email de redefinição enviado"),
    onError: (e) => toast.error(errMsg(e)),
  });

  const mismatch = useMemo(
    () => !!newPassword && newPassword !== confirmPassword,
    [newPassword, confirmPassword],
  );

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar senha</DialogTitle>
          <DialogDescription>{target?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="new-pwd">Nova senha</Label>
            <Input
              id="new-pwd"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <Label htmlFor="confirm-pwd">Confirmar senha</Label>
            <Input
              id="confirm-pwd"
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={savePassword.isPending || newPassword.length < 8 || mismatch}
            onClick={() =>
              target && savePassword.mutate({ userId: target.id, password: newPassword })
            }
          >
            {savePassword.isPending ? "Salvando..." : "Definir nova senha"}
          </Button>
          {mismatch && <p className="text-xs text-destructive">As senhas não coincidem.</p>}
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted-foreground">
              Ou envie um email para o usuário definir a própria senha.
            </p>
            <Button
              variant="outline"
              className="w-full"
              disabled={sendReset.isPending}
              onClick={() => target && sendReset.mutate(target.id)}
            >
              {sendReset.isPending ? "Enviando..." : "Enviar email de redefinição"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
