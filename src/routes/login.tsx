import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import grouLogoBranco from "@/assets/lidi-logo-white.png";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { JornadaDoLead } from "@/components/brand/jornada-do-lead";
import { ArrowRight, Loader2, Lock, Mail, User } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Compass CRM · Grou" }] }),
  component: LoginPage,
});

/*
 * Entrada do Compass CRM, nas cores da Grou: fundo azul profundo com os arcos
 * ciano da marca, a jornada de um lead (do formulário à renovação) à esquerda
 * e o formulário num cartão que acompanha o mouse — a luz ciano segue o
 * cursor e o cartão inclina de leve. Login, cadastro restrito ao domínio da
 * Grou e recuperação de senha, como antes.
 */
function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"sdr" | "executivo" | "cs">("sdr");
  const [loading, setLoading] = useState(false);
  const cartao = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  // Luz e inclinação pelo mouse: variáveis CSS direto no elemento, sem render.
  function seguirMouse(e: React.PointerEvent<HTMLDivElement>) {
    const el = cartao.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 6}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 8}deg`);
  }
  function soltarMouse() {
    const el = cartao.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

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

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha";
  const campo =
    "flex h-12 items-center gap-3 rounded-full border border-white/15 bg-[#030b3a]/70 px-5 transition-[border-color,box-shadow] focus-within:border-[#88d5ce] focus-within:shadow-[0_0_0_4px_rgb(136_213_206/0.2)]";
  const entrada =
    "h-full w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/40";

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#05104c] text-white">
      {/* Fundo: arcos ciano e brilhos, como no material da marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_10%,#1d3bb0_0%,transparent_60%),radial-gradient(80%_70%_at_90%_95%,#123a7a_0%,transparent_55%)]"
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path
          d="M-80 520 C 120 600, 300 760, 360 960"
          stroke="#5fd1c2"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M1060 -40 C 1060 180, 1240 330, 1520 380"
          stroke="#5fd1c2"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path d="M-40 90 L 520 470" stroke="#ffffff" strokeOpacity="0.12" />
        <path d="M980 640 L 1480 1000" stroke="#ffffff" strokeOpacity="0.12" />
      </svg>

      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-wrap items-center justify-center gap-12 px-6 py-12 lg:justify-between">
        {/* Vitrine: só em tela larga, para o formulário vir primeiro no celular */}
        <section className="hidden max-w-[480px] flex-1 flex-col gap-10 lg:flex">
          <img src={grouLogoBranco} alt="Grou" className="h-9 w-auto self-start" />
          <JornadaDoLead />
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold tracking-[0.36em] text-[#88d5ce]">COMPASS CRM</span>
            <h2 className="text-[34px] leading-[1.12] font-bold tracking-tight text-white">
              Toda a nossa operação em um só lugar.
            </h2>
            <p className="text-base leading-relaxed text-[#c9d2ea]">
              Marketing, SDR, comercial, financeiro, trainers e Customer Success, do primeiro
              contato à renovação.
            </p>
          </div>
        </section>

        <div
          ref={cartao}
          onPointerMove={seguirMouse}
          onPointerLeave={soltarMouse}
          className="login-cartao relative w-full max-w-[440px] rounded-[32px] px-8 py-10 sm:px-10"
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <span className="grid h-[84px] w-[84px] place-items-center rounded-full border border-white/20 bg-[#030b3a]/70">
              <img src={grouLogoBranco} alt="Grou" className="w-[54px]" />
            </span>
            <span className="pl-[0.36em] text-xs font-bold tracking-[0.36em] text-[#88d5ce]">
              COMPASS CRM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <label className={campo}>
                <User className="h-[18px] w-[18px] shrink-0 text-white/60" strokeWidth={1.75} />
                <span className="sr-only">Nome completo</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={entrada}
                  placeholder="Nome completo"
                />
              </label>
            )}
            <label className={campo}>
              <Mail className="h-[18px] w-[18px] shrink-0 text-white/60" strokeWidth={1.75} />
              <span className="sr-only">E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={entrada}
                placeholder="voce@grougp.com.br"
              />
            </label>
            {mode !== "reset" && (
              <label className={campo}>
                <Lock className="h-[18px] w-[18px] shrink-0 text-white/60" strokeWidth={1.75} />
                <span className="sr-only">Senha</span>
                <input
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={entrada}
                  placeholder="Senha"
                />
              </label>
            )}
            {mode === "login" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMode("reset")}
                  className="text-[13px] text-white/70 transition-colors hover:text-white"
                >
                  Esqueci minha senha
                </button>
              </div>
            )}
            {mode === "signup" && (
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as "sdr" | "executivo" | "cs")}
                className="grid grid-cols-3 gap-2"
                aria-label="Qual é o seu papel?"
              >
                {[
                  { v: "sdr", label: "SDR" },
                  { v: "executivo", label: "Executivo" },
                  { v: "cs", label: "CS" },
                ].map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm ${
                      role === opt.v
                        ? "border-[#88d5ce] bg-[#88d5ce]/15 text-white"
                        : "border-white/15 text-white/70"
                    }`}
                  >
                    <RadioGroupItem value={opt.v} id={`role-${opt.v}`} className="sr-only" />
                    {opt.label}
                  </label>
                ))}
              </RadioGroup>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#f2f1ee] text-[15px] font-semibold text-[#05104c] shadow-[0_12px_30px_-10px_rgb(0_0_0/0.5)] transition-[transform,background-color] hover:-translate-y-px hover:bg-white disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {title}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2.2}
                  />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#88d5ce]">
            {mode === "login" && (
              <>
                Sem conta?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="font-semibold underline-offset-4 hover:underline"
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
                  className="font-semibold underline-offset-4 hover:underline"
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
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  Voltar para entrar
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
