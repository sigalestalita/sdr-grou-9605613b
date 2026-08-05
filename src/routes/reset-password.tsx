import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — SDR GROU" },
      { name: "description", content: "Defina uma nova senha para acessar a plataforma SDR GROU." },
      { property: "og:title", content: "Redefinir senha — SDR GROU" },
      { property: "og:description", content: "Defina uma nova senha para acessar a plataforma SDR GROU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada!");
      navigate({ to: "/kanban" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Definir nova senha</h1>
          <p className="text-sm text-muted-foreground">
            Escolha uma nova senha com pelo menos 8 caracteres.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="password">Nova senha</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input
              id="confirm"
              type="password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar senha"}
          </Button>
        </form>
      </Card>
    </div>
  );
}