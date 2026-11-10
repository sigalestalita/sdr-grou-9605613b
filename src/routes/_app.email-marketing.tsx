import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Filter, Mail, Megaphone } from "lucide-react";
import { salvarLimiteDiario, situacaoDoEnvio } from "@/lib/email-marketing.functions";
import { useCurrentRole } from "@/lib/use-role";

export const Route = createFileRoute("/_app/email-marketing")({
  component: EmailMarketingLayout,
  head: () => ({ meta: [{ title: "E-mail marketing | Grou Compass" }] }),
});

const ABAS = [
  { to: "/email-marketing", label: "Campanhas", icon: Megaphone, exato: false },
  { to: "/email-marketing/segmentos", label: "Segmentações", icon: Filter, exato: true },
  { to: "/email-marketing/descadastros", label: "Descadastros", icon: Ban, exato: true },
] as const;

function EmailMarketingLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ativa = (to: string) => {
    if (to === "/email-marketing")
      return (
        pathname === "/email-marketing" ||
        pathname === "/email-marketing/" ||
        pathname.startsWith("/email-marketing/campanha")
      );
    return pathname.startsWith(to);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2">
        <h1 className="page-title flex shrink-0 items-center gap-2">
          <Mail className="h-4 w-4 text-primary" strokeWidth={1.75} /> E-mail marketing
        </h1>
        <nav className="flex flex-wrap items-center gap-0.5">
          {ABAS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.to}
                to={a.to}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors ${
                  ativa(a.to)
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {a.label}
              </Link>
            );
          })}
        </nav>
        <SituacaoEnvio />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

function SituacaoEnvio() {
  const qc = useQueryClient();
  const fn = useServerFn(situacaoDoEnvio);
  const salvarFn = useServerFn(salvarLimiteDiario);
  const { canAccessAll } = useCurrentRole();
  const { data } = useQuery({
    queryKey: ["email-mkt", "situacao"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });
  const salvar = useMutation({
    mutationFn: (valor: number | null) => salvarFn({ data: { valor } }),
    onSuccess: () => {
      toast.success("Limite diário atualizado");
      qc.invalidateQueries({ queryKey: ["email-mkt", "situacao"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  if (!data) return null;

  const mudarLimite = () => {
    const v = window.prompt(
      "Limite de e-mails por dia (deixe em branco para enviar sem limite)",
      data.limite ? String(data.limite) : "",
    );
    if (v == null) return;
    if (!v.trim()) return salvar.mutate(null);
    const n = Number(v.replace(/\D/g, ""));
    if (!Number.isInteger(n) || n < 1) return toast.error("Informe um número inteiro maior que 0");
    salvar.mutate(n);
  };

  return (
    <div className="text-[12px] text-muted-foreground sm:ml-auto sm:text-right">
      <span>
        Hoje:{" "}
        <strong className="font-semibold text-foreground tabular-nums">
          {data.hoje.toLocaleString("pt-BR")}
        </strong>{" "}
        {data.limite
          ? `de ${data.limite.toLocaleString("pt-BR")} envios`
          : "envios · sem limite diário"}
      </span>
      {canAccessAll && (
        <button
          type="button"
          onClick={mudarLimite}
          disabled={salvar.isPending}
          className="ml-2 underline-offset-2 hover:text-foreground hover:underline"
        >
          alterar
        </button>
      )}
    </div>
  );
}
