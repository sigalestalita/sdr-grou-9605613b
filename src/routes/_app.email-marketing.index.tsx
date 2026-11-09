import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Megaphone, Plus } from "lucide-react";
import { listarCampanhas, salvarCampanha } from "@/lib/email-marketing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/email-marketing/")({
  component: CampanhasPage,
});

const STATUS: Record<string, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: "Rascunho", tom: "bg-muted text-muted-foreground" },
  agendada: {
    rotulo: "Agendada",
    tom: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  enviando: {
    rotulo: "Enviando",
    tom: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  pausada: {
    rotulo: "Pausada",
    tom: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  },
  enviada: {
    rotulo: "Enviada",
    tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  cancelada: {
    rotulo: "Cancelada",
    tom: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  },
};

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");
const dataHora = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

function CampanhasPage() {
  const navigate = useNavigate();
  const listarFn = useServerFn(listarCampanhas);
  const salvarFn = useServerFn(salvarCampanha);
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["email-mkt", "campanhas"],
    queryFn: () => listarFn(),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => c.status === "enviando") ? 30_000 : false,
  });

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (!status || c.status === status) &&
        (!b || c.nome.toLowerCase().includes(b) || c.assunto.toLowerCase().includes(b)),
    );
  }, [data, status, busca]);

  const nova = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          id: null,
          nome: "Nova campanha",
          segmento_id: null,
          assunto: "",
          preheader: null,
          corpo: "",
          formato: "texto",
          remetente_nome: "Grou",
          remetente_email: "marketing@grougp.com.br",
          responder_para: null,
        },
      }),
    onSuccess: (r) => navigate({ to: "/email-marketing/campanha/$id", params: { id: r.id } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar campanha"),
  });

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou assunto"
          className="h-9 w-full text-[13px] sm:w-64"
        />
        <div className="flex flex-wrap gap-1.5">
          {["", ...Object.keys(STATUS)].map((s) => (
            <button
              key={s || "todas"}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-[12px] ${status === s ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              {s ? STATUS[s].rotulo : "Todas"}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => nova.mutate()}
          disabled={nova.isPending}
        >
          {nova.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          Nova campanha
        </Button>
      </div>

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar campanhas"}
        </p>
      ) : lista.length === 0 ? (
        <div className="surface-panel flex flex-col items-center gap-2 p-8 text-center text-[13px] text-muted-foreground">
          <Megaphone className="h-6 w-6" />
          {data?.length
            ? "Nenhuma campanha com esse filtro."
            : "Nenhuma campanha ainda. Crie a primeira em “Nova campanha”."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((c) => {
            const st = STATUS[c.status] ?? STATUS.rascunho;
            const m = c.metricas;
            const quando =
              c.status === "agendada" && c.agendada_para
                ? `Agendada para ${dataHora(c.agendada_para)}`
                : c.concluida_em
                  ? `Concluída em ${dataHora(c.concluida_em)}`
                  : c.iniciada_em
                    ? `Iniciada em ${dataHora(c.iniciada_em)}`
                    : `Editada em ${dataHora(c.updated_at)}`;
            return (
              <Link
                key={c.id}
                to="/email-marketing/campanha/$id"
                params={{ id: c.id }}
                className="surface-panel flex flex-col gap-2 p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.nome}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {c.assunto || "Sem assunto"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tom}`}
                  >
                    {st.rotulo}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Numero rotulo="Destinatários" valor={c.destinatarios.toLocaleString("pt-BR")} />
                  <Numero
                    rotulo="Enviados"
                    valor={m.enviados.toLocaleString("pt-BR")}
                    extra={
                      m.pendentes ? `${m.pendentes.toLocaleString("pt-BR")} na fila` : undefined
                    }
                  />
                  <Numero rotulo="Abertura" valor={pct(m.aberturas, m.enviados)} />
                  <Numero rotulo="Cliques" valor={m.cliques.toLocaleString("pt-BR")} />
                  <Numero rotulo="Descadastros" valor={m.descadastros.toLocaleString("pt-BR")} />
                  <Numero rotulo="Falhas" valor={m.falhas.toLocaleString("pt-BR")} />
                </div>
                <p className="mt-auto text-[11px] text-muted-foreground">{quando}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-1 py-1.5">
      <p className="text-[15px] font-semibold tabular-nums">{valor}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      {extra && <p className="text-[10px] text-muted-foreground">{extra}</p>}
    </div>
  );
}
