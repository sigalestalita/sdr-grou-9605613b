import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, RotateCcw, Send, User } from "lucide-react";
import { previaDaPrimeiraMensagem, simularAtendimentoIa } from "@/lib/whatsapp-ai.functions";
import { getEmbeddedSignupConfig } from "@/lib/whatsapp-accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/whatsapp/playground")({
  component: PlaygroundPage,
  head: () => ({ meta: [{ title: "Ensaio da IA | Grou Compass" }] }),
});

type Fala = { de: "lead" | "ia"; texto: string };
type Tipo = "consultoria" | "empresa" | "pessoa_fisica";

const PORTES = ["1 - 10", "11 - 50", "51 - 100", "101 - 200", "201 - 500", "501 - 2.000"];

const TIPOS: Array<{ valor: Tipo; rotulo: string; ajuda: string }> = [
  {
    valor: "consultoria",
    rotulo: "Consultoria",
    ajuda: "Atendida sem corte de porte. O bastão vai para quem cuida de consultoria.",
  },
  {
    valor: "empresa",
    rotulo: "Empresa",
    ajuda: "Atendida abaixo do corte de porte configurado. Acima dele, humano desde o início.",
  },
  {
    valor: "pessoa_fisica",
    rotulo: "Pessoa física",
    ajuda: "Segue a mesma regra de empresa pequena.",
  },
];

/*
 * Ensaio: conversar com a IA como se fosse um lead.
 *
 * O atendimento automático é a parte do sistema que fala com o cliente sem
 * ninguém olhando. Mudou o prompt, a oferta ou o corte de porte, muda o que
 * ela diz — e até aqui o único jeito de saber era esperar um lead real chegar.
 *
 * Nada é gravado: o lead é inventado, e nem conversa nem mensagem existem no
 * banco. O que é real é o resto — o mesmo prompt, as mesmas ofertas com a
 * mesma validade, a mesma regra de quem é atendido e a mesma decisão de bastão.
 */
function PlaygroundPage() {
  const simularFn = useServerFn(simularAtendimentoIa);
  const previaFn = useServerFn(previaDaPrimeiraMensagem);
  const pessoasFn = useServerFn(getEmbeddedSignupConfig);

  const [tipo, setTipo] = useState<Tipo>("empresa");
  const [porte, setPorte] = useState<string>("11 - 50");
  const [jaECliente, setJaECliente] = useState(false);
  const [sdr, setSdr] = useState<string>("");
  const [nome, setNome] = useState("Ana Paula");
  const [empresa, setEmpresa] = useState("Indústria Exemplo");
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState("");

  const { data: cfg } = useQuery({
    queryKey: ["wa-embedded-signup-config"],
    queryFn: () => pessoasFn(),
    staleTime: 5 * 60_000,
  });

  /*
   * A mensagem que abre a conversa.
   *
   * O ensaio começava na resposta do lead e pulava o template — que é
   * justamente onde a campanha entra. Sem ver essa parte não dá para saber se
   * o template certo seria escolhido, nem com que texto o lead recebe.
   */
  const { data: primeira } = useQuery({
    queryKey: ["wa-primeira-mensagem", tipo, sdr, nome, empresa],
    queryFn: () =>
      previaFn({
        data: {
          leadType: tipo,
          nome: nome.trim() || "Lead de teste",
          empresa: empresa.trim() || null,
          sdrUserId: sdr || null,
        },
      }),
  });

  const simular = useMutation({
    mutationFn: (proximas: Fala[]) =>
      simularFn({
        data: {
          perfil: {
            leadType: tipo,
            companySize: tipo === "consultoria" ? null : porte,
            jaECliente,
            sdrUserId: sdr || null,
            nome: nome.trim() || "Lead de teste",
            empresa: empresa.trim() || null,
          },
          mensagens: proximas.map((f) => ({ de: f.de, texto: f.texto })),
        },
      }),
    onSuccess: (r) => {
      if (r.resposta) setFalas((f) => [...f, { de: "ia", texto: r.resposta as string }]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na simulação"),
  });

  function enviar() {
    const t = texto.trim();
    if (!t) return;
    const proximas: Fala[] = [...falas, { de: "lead", texto: t }];
    setFalas(proximas);
    setTexto("");
    /*
     * A primeira mensagem vai junto no histórico.
     *
     * Na conversa real ela fica salva e a IA a lê antes de responder. Sem
     * mandar aqui, a IA acha que a conversa começa agora e cumprimenta de
     * novo — o ensaio mostrava um comportamento que a produção não tem.
     */
    const comAbertura: Fala[] = primeira?.corpo
      ? [{ de: "ia", texto: primeira.corpo }, ...proximas]
      : proximas;
    simular.mutate(comAbertura);
  }

  function recomeçar() {
    setFalas([]);
    setTexto("");
    simular.reset();
  }

  const r = simular.data;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:flex-row lg:p-6">
      {/* Perfil do lead */}
      <div className="w-full shrink-0 space-y-4 lg:w-[300px]">
        <div>
          <h1 className="text-lg font-semibold">Ensaio da IA</h1>
          <p className="text-[12px] text-muted-foreground">
            Converse como se fosse o lead. Nada é gravado — nem lead, nem conversa —, mas o prompt,
            as ofertas e as regras são os mesmos que valem para o lead de verdade.
          </p>
        </div>

        <div className="surface-panel space-y-3 p-3">
          <div>
            <p className="section-label mb-1.5">Tipo de lead</p>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.valor}
                  onClick={() => {
                    setTipo(t.valor);
                    recomeçar();
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    tipo === t.valor
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {TIPOS.find((t) => t.valor === tipo)?.ajuda}
            </p>
          </div>

          {tipo !== "consultoria" && (
            <div>
              <p className="section-label mb-1">Porte</p>
              <select
                value={porte}
                onChange={(e) => {
                  setPorte(e.target.value);
                  recomeçar();
                }}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              >
                {PORTES.map((p) => (
                  <option key={p} value={p}>
                    {p} funcionários
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={jaECliente}
              onChange={(e) => {
                setJaECliente(e.target.checked);
                recomeçar();
              }}
            />
            <span className="text-[12px]">
              Já é cliente Grou
              <span className="block text-[11px] text-muted-foreground">
                As condições da campanha são de quem ainda não é. Marque para ver a IA recusar e
                passar o bastão.
              </span>
            </span>
          </label>

          <div>
            <p className="section-label mb-1">SDR responsável</p>
            <select
              value={sdr}
              onChange={(e) => {
                setSdr(e.target.value);
                recomeçar();
              }}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            >
              <option value="">— sem responsável —</option>
              {(cfg?.pessoas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">É o nome com que a IA assina.</p>
          </div>

          <div className="grid gap-2">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do lead"
              className="h-8 text-xs"
            />
            {tipo !== "pessoa_fisica" && (
              <Input
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                placeholder="Empresa"
                className="h-8 text-xs"
              />
            )}
          </div>
        </div>

        {/* O que a IA recebeu: é o que explica a resposta */}
        {r && (
          <div className="surface-panel space-y-2 p-3">
            <p className="section-label">O que vale para este perfil</p>
            <p className="text-[12px]">
              {r.atende ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                >
                  IA atende
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                >
                  humano desde o início
                </Badge>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">{r.motivo}</p>
            <p className="text-[11px] text-muted-foreground">
              Assina como <strong>{r.assinatura}</strong> · bastão para{" "}
              <strong>{r.handoffPara === "consultoria" ? "consultoria" : "SDR responsável"}</strong>
            </p>
            {r.handoff?.shouldHandoff && (
              <p className="rounded-md border border-primary/30 bg-primary/10 p-2 text-[11px]">
                <strong>Passou o bastão.</strong> {r.handoff.reason}
              </p>
            )}
            {primeira?.template && (
              <p className="text-[11px] text-muted-foreground">
                Abre com <strong>{primeira.template.nome}</strong>
                {primeira.template.ehDeConsultoria ? " (slot de consultoria)" : " (slot padrão)"}
              </p>
            )}
            <div>
              <p className="section-label mt-2 mb-1">Ofertas no prompt ({r.ofertas.length})</p>
              {r.ofertas.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma vigente — a IA está instruída a não citar preço nenhum.
                </p>
              ) : (
                <ul className="space-y-1">
                  {r.ofertas.map((o) => (
                    <li key={o.titulo} className="text-[11px] text-muted-foreground">
                      • {o.titulo}
                      {o.validoAte ? ` (até ${o.validoAte})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Conversa */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[12px] text-muted-foreground">
            {falas.length === 0
              ? "Escreva a primeira mensagem como o lead escreveria."
              : `${falas.length} mensagem(ns) no ensaio`}
          </p>
          <Button size="sm" variant="ghost" onClick={recomeçar} disabled={falas.length === 0}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Recomeçar
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {primeira && (
            <div className="space-y-2">
              <p className="text-center text-[11px] text-muted-foreground">
                {primeira.template
                  ? `Primeira mensagem · ${primeira.template.nome}`
                  : "Primeira mensagem"}
              </p>
              {primeira.corpo && (
                <div className="flex flex-row-reverse gap-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-[13px] text-primary-foreground">
                    {primeira.corpo}
                  </div>
                </div>
              )}
              {primeira.aviso && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                  {primeira.aviso}
                </p>
              )}
            </div>
          )}

          {falas.length === 0 && (
            <p className="mx-auto max-w-sm pt-6 text-center text-[12px] text-muted-foreground">
              Agora responda como o lead responderia. Experimente pedir preço, pedir para falar com
              alguém ou marcar uma reunião — são os três momentos que mudam o rumo.
            </p>
          )}
          {falas.map((f, i) => (
            <div key={i} className={`flex gap-2 ${f.de === "lead" ? "" : "flex-row-reverse"}`}>
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  f.de === "lead" ? "bg-muted" : "bg-primary/15 text-primary"
                }`}
              >
                {f.de === "lead" ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </span>
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] ${
                  f.de === "lead" ? "bg-muted" : "bg-primary text-primary-foreground"
                }`}
              >
                {f.texto}
              </div>
            </div>
          ))}
          {simular.isPending && (
            <p className="text-[12px] text-muted-foreground">A IA está escrevendo…</p>
          )}
          {r && !r.atende && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px]">
              A IA não responderia a este lead: {r.motivo} A conversa iria direto para a pessoa
              responsável.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-border p-3">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escreva como o lead…"
            disabled={simular.isPending}
          />
          <Button onClick={enviar} disabled={!texto.trim() || simular.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
