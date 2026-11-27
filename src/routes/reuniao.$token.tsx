import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck2, CalendarClock, Loader2 } from "lucide-react";
import { escolherHorarioPublico, verOfertaPublica } from "@/lib/cs-reuniao-ofertas.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reuniao/$token")({
  head: () => ({
    meta: [{ title: "Escolha o horário · Grou" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EscolherHorario,
});

type Dados = Awaited<ReturnType<typeof verOfertaPublica>>;

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * O que o cliente abre pelo link: os horários que o CS reservou. Escolhe um,
 * confirma, e os outros são liberados. Sem login.
 */
function EscolherHorario() {
  const { token } = Route.useParams();
  const ver = useServerFn(verOfertaPublica);
  const escolher = useServerFn(escolherHorarioPublico);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcado, setMarcado] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState<string | null>(null);

  const carregar = () =>
    ver({ data: { token } })
      .then(setDados)
      .catch(() => setErro("Não foi possível abrir o convite."));
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function confirmar() {
    if (!marcado) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await escolher({ data: { token, meetingId: marcado, nome: nome || undefined } });
      setConfirmado(r.inicio);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível confirmar.");
      void carregar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Grou</p>
        {!dados && !erro && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        )}
        {dados && !dados.encontrada && (
          <p className="text-sm">Este convite não existe ou foi removido.</p>
        )}
        {dados?.encontrada && (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{dados.titulo}</h1>
              <p className="text-sm text-muted-foreground">
                {dados.quemConvida} convida
                {dados.empresa ? ` a ${dados.empresa}` : ""} para uma conversa
                {dados.duracao ? ` de ${dados.duracao} minutos` : ""}.
              </p>
            </div>

            {confirmado || (dados.status === "escolhida" && dados.escolhida) ? (
              <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                  <CalendarCheck2 className="h-5 w-5" /> Horário confirmado
                </p>
                <p className="text-sm capitalize">
                  {quando(confirmado ?? dados.escolhida!.inicio)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dados.quemConvida} já recebeu o aviso. Até lá!
                </p>
              </div>
            ) : dados.status === "cancelada" ? (
              <p className="text-sm">
                Este convite foi cancelado. Fale com {dados.quemConvida} para combinar outro
                horário.
              </p>
            ) : dados.horarios.length === 0 ? (
              <p className="text-sm">
                Os horários deste convite já passaram. Fale com {dados.quemConvida} para combinar
                outro.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium">Escolha o melhor horário para você:</p>
                <div className="space-y-2">
                  {dados.horarios.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setMarcado(h.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm capitalize transition ${
                        marcado === h.id
                          ? "border-primary bg-primary/10 font-medium"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                      {quando(h.inicio)}
                    </button>
                  ))}
                </div>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome (opcional)"
                  maxLength={120}
                />
                <Button className="w-full" disabled={!marcado || enviando} onClick={confirmar}>
                  {enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Confirmar horário
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Horários no fuso de Brasília.
                </p>
              </div>
            )}
          </>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </div>
    </div>
  );
}
