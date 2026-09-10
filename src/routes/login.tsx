import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import lidiLogo from "@/assets/lidi-logo-white.png";
import grouLogo from "@/assets/grou-logo.png";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTheme } from "@/lib/use-theme";
import { ArrowRight, Loader2, Lock, Mail, User } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Compass CRM · Grou" }] }),
  component: LoginPage,
});

/*
 * Tela de entrada do Compass CRM: fundo "líquido" (bolhas de cor em movimento
 * lento sobre o vídeo), cartão de vidro transparente com brilho que atravessa
 * devagar, e o formulário de sempre — login, cadastro restrito ao domínio da
 * Grou e recuperação de senha. Respeita "reduzir movimento" do sistema.
 */
function LoginPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"sdr" | "executivo" | "cs" | "gestao">("sdr");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/" });
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Se o e-mail existir, você receberá o link para redefinir a senha.");
        setMode("login");
      } else {
        if (!/@grougp\.com\.br$/i.test(email.trim())) {
          throw new Error("Cadastro restrito a emails @grougp.com.br");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: name, role },
          },
        });
        if (error) throw error;
        toast.success("Cadastro feito! Verifique seu email para confirmar.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  const dark = theme === "dark";
  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha";

  return (
    <div className="liquid-page relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {/* Vídeo de fundo, bem discreto, sob as bolhas */}
      <video
        aria-hidden
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="pointer-events-none absolute inset-0 -z-30 h-full w-full object-cover opacity-20 dark:opacity-50"
        src="/login-bg.mp4"
      />
      {/* Bolhas líquidas */}
      <div aria-hidden className="liquid-blobs pointer-events-none absolute inset-0 -z-20">
        <span className="liquid-blob liquid-blob-1" />
        <span className="liquid-blob liquid-blob-2" />
        <span className="liquid-blob liquid-blob-3" />
        <span className="liquid-blob liquid-blob-4" />
      </div>
      <div aria-hidden className="liquid-grain pointer-events-none absolute inset-0 -z-10" />

      {/* Tema */}
      <div className="glass-pill absolute top-4 right-4 flex items-center gap-1 rounded-full p-1">
        {(
          [
            { v: "light" as const, label: "Claro" },
            { v: "dark" as const, label: "Escuro" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setTheme(opt.v)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              theme === opt.v
                ? "bg-primary text-primary-foreground shadow"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="glass-card liquid-float relative w-full max-w-md rounded-[28px] p-8 sm:p-10">
        {/* Marca */}
        <div className="liquid-rise mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src={dark ? lidiLogo : grouLogo}
            alt="Grou"
            className="h-11 w-auto drop-shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
          />
          <div className="flex flex-col items-center gap-1">
            <span className="wordmark text-[13px] font-semibold uppercase tracking-[0.42em] text-foreground">
              Compass CRM
            </span>
            <span className="text-xs text-foreground/60">
              O sistema da Grou — SDR, Comercial e Customer Success
            </span>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="liquid-rise space-y-4"
          style={{ animationDelay: "120ms" }}
        >
          <h1 className="sr-only">{title}</h1>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-foreground/80">
                Nome completo
              </Label>
              <div className="glass-input flex items-center gap-2 rounded-xl px-3">
                <User className="h-4 w-4 shrink-0 text-foreground/50" strokeWidth={1.75} />
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
                  placeholder="Como aparece para o time"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-foreground/80">
              E-mail
            </Label>
            <div className="glass-input flex items-center gap-2 rounded-xl px-3">
              <Mail className="h-4 w-4 shrink-0 text-foreground/50" strokeWidth={1.75} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
                placeholder="voce@grougp.com.br"
              />
            </div>
            {mode === "signup" && (
              <p className="text-xs text-foreground/55">
                Cadastro restrito ao time Grou (@grougp.com.br)
              </p>
            )}
          </div>
          {mode !== "reset" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground/80">
                  Senha
                </Label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-xs text-foreground/60 transition-colors hover:text-foreground"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className="glass-input flex items-center gap-2 rounded-xl px-3">
                <Lock className="h-4 w-4 shrink-0 text-foreground/50" strokeWidth={1.75} />
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label className="text-foreground/80">Qual é o seu papel?</Label>
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as "sdr" | "executivo" | "cs" | "gestao")}
                className="grid grid-cols-2 gap-2"
              >
                {[
                  { v: "sdr", label: "SDR" },
                  { v: "executivo", label: "Executivo" },
                  { v: "cs", label: "Customer Success" },
                  { v: "gestao", label: "Gestão" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`glass-input flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                      role === opt.v ? "ring-2 ring-primary/60" : ""
                    }`}
                  >
                    <RadioGroupItem value={opt.v} id={`role-${opt.v}`} />
                    {opt.label}
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="glass-button group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-semibold text-white disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {title}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </>
            )}
          </button>
        </form>

        <p
          className="liquid-rise mt-5 text-center text-xs text-foreground/60"
          style={{ animationDelay: "220ms" }}
        >
          {mode === "login" && (
            <>
              Sem conta?{" "}
              <button
                onClick={() => setMode("signup")}
                className="font-semibold text-primary hover:underline"
              >
                Cadastre-se
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Já tem conta?{" "}
              <button
                onClick={() => setMode("login")}
                className="font-semibold text-primary hover:underline"
              >
                Entre
              </button>
            </>
          )}
          {mode === "reset" && (
            <>
              Lembrou a senha?{" "}
              <button
                onClick={() => setMode("login")}
                className="font-semibold text-primary hover:underline"
              >
                Voltar para entrar
              </button>
            </>
          )}
        </p>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] tracking-[0.2em] text-foreground/40 uppercase">
        Grou Compass CRM
      </p>
    </div>
  );
}
