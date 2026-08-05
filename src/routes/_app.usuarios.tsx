import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers,
  updateUserRole,
  removeUser,
  setUserPassword,
  sendUserPasswordReset,
} from "@/lib/users.functions";
import { useCurrentRole } from "@/lib/use-role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_app/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Lidi" }] }),
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  gestao: "Gestão",
  executivo: "Executivo",
  sdr: "SDR",
};

function UsersPage() {
  const { isSuperAdmin, isGestao, loading: roleLoading } = useCurrentRole();
  const listFn = useServerFn(listUsers);
  const updateFn = useServerFn(updateUserRole);
  const removeFn = useServerFn(removeUser);
  const setPasswordFn = useServerFn(setUserPassword);
  const sendResetFn = useServerFn(sendUserPasswordReset);
  const qc = useQueryClient();
  const [pwdTarget, setPwdTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => listFn(),
    enabled: !roleLoading && (isSuperAdmin || isGestao),
  });

  const update = useMutation({
    mutationFn: (v: { userId: string; role: "super_admin" | "gestao" | "executivo" | "sdr" }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const savePassword = useMutation({
    mutationFn: (v: { userId: string; password: string }) => setPasswordFn({ data: v }),
    onSuccess: () => {
      toast.success("Senha atualizada");
      setPwdTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const sendReset = useMutation({
    mutationFn: (userId: string) =>
      sendResetFn({
        data: { userId, redirectTo: `${window.location.origin}/reset-password` },
      }),
    onSuccess: () => toast.success("Email de redefinição enviado"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (roleLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!isSuperAdmin && !isGestao) {
    return (
      <div className="p-8 max-w-2xl">
        <Card className="p-6 space-y-2">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para gerenciar usuários.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <Link to="/configuracoes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Voltar para Configurações
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestão de usuários</h1>
        {!data?.canEdit && (
          <Badge variant="outline">Somente leitura — só super admin pode editar</Badge>
        )}
      </div>

      <Card className="p-5 space-y-2">
        <p className="text-xs text-muted-foreground">
          Apenas emails do domínio <strong>@grougp.com.br</strong> podem se cadastrar pela tela de login.
          Cada novo usuário escolhe seu papel no momento do cadastro. Aqui você ajusta papéis e remove acessos.
        </p>
      </Card>

      {isLoading || !data ? (
        <div className="p-8 text-sm text-muted-foreground">Carregando usuários…</div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Papel</th>
                <th className="text-left p-3">Cadastrado em</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const isTalita = u.email.toLowerCase() === "talita.sigales@grougp.com.br";
                const isSelf = u.id === data.currentUserId;
                const disabled = !data.canEdit || isTalita;
                return (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="p-3">{u.full_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">
                      <Select
                        value={u.role ?? "sdr"}
                        disabled={disabled}
                        onValueChange={(v) =>
                          update.mutate({ userId: u.id, role: v as "super_admin" | "gestao" | "executivo" | "sdr" })
                        }
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sdr">SDR</SelectItem>
                          <SelectItem value="executivo">Executivo</SelectItem>
                          <SelectItem value="gestao">Gestão</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {!u.role && (
                        <span className="ml-2 text-xs text-amber-400">sem papel</span>
                      )}
                      {isTalita && (
                        <Badge className="ml-2" variant="secondary">
                          {ROLE_LABEL[u.role ?? "super_admin"]}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right">
                      {data.canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mr-2"
                          onClick={() => {
                            setNewPassword("");
                            setConfirmPassword("");
                            setPwdTarget({ id: u.id, email: u.email });
                          }}
                        >
                          <KeyRound className="h-3 w-3 mr-1" /> Senha
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled || isSelf}
                        onClick={() => {
                          if (confirm(`Remover ${u.email}? Essa ação não pode ser desfeita.`)) {
                            remove.mutate(u.id);
                          }
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
        </Card>
      )}

      <Dialog open={!!pwdTarget} onOpenChange={(o) => !o && setPwdTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar senha</DialogTitle>
            <DialogDescription>{pwdTarget?.email}</DialogDescription>
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
              disabled={
                savePassword.isPending || newPassword.length < 8 || newPassword !== confirmPassword
              }
              onClick={() =>
                pwdTarget &&
                savePassword.mutate({ userId: pwdTarget.id, password: newPassword })
              }
            >
              {savePassword.isPending ? "Salvando..." : "Definir nova senha"}
            </Button>
            {newPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">As senhas não coincidem.</p>
            )}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-2">
                Ou envie um email para o usuário definir a própria senha.
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={sendReset.isPending}
                onClick={() => pwdTarget && sendReset.mutate(pwdTarget.id)}
              >
                {sendReset.isPending ? "Enviando..." : "Enviar email de redefinição"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}