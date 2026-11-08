import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { perguntarAoAssistente } from "@/lib/assistente.functions";

/*
 * Botão flutuante do assistente, em todas as telas. Responde sobre os dados
 * do CRM e ensina a usar as telas. A conversa fica só nesta aba do navegador.
 */
type Mensagem = { role: "user" | "assistant"; content: string };
const CHAVE = "compass-assistente";

const SUGESTOES = [
  "Como uso esta tela?",
  "Quantos negócios ganhamos nos últimos 30 dias e quanto deu?",
  "Quais clientes estão no vermelho e renovam nos próximos 60 dias?",
  "Quais leads quentes ainda não foram contatados?",
];

function lerConversa(): Mensagem[] {
  try {
    const v = sessionStorage.getItem(CHAVE);
    return v ? (JSON.parse(v) as Mensagem[]) : [];
  } catch {
    return [];
  }
}

export function AssistenteFlutuante() {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const tela = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ""),
  });
  const fn = useServerFn(perguntarAoAssistente);

  useEffect(() => setMsgs(lerConversa()), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(msgs.slice(-30)));
    } catch {
      // sem armazenamento: a conversa só não sobrevive a recarregar
    }
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs, aberto]);

  const perguntar = useMutation({
    mutationFn: (conversa: Mensagem[]) => fn({ data: { mensagens: conversa.slice(-20), tela } }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", content: r.resposta }]),
    onError: (e) =>
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content: `Não consegui responder agora: ${e instanceof Error ? e.message : "erro"}`,
        },
      ]),
  });

  const enviar = (t: string) => {
    const pergunta = t.trim();
    if (!pergunta || perguntar.isPending) return;
    const nova = [...msgs, { role: "user" as const, content: pergunta }];
    setMsgs(nova);
    setTexto("");
    perguntar.mutate(nova);
  };

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Assistente do Compass"
        className="fixed bottom-20 right-4 z-50 md:bottom-5 md:right-5 flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#0b1f3a] to-[#1e4f9c] px-4 text-[13px] font-semibold text-white shadow-lg transition hover:scale-105"
      >
        <Sparkles className="h-4 w-4" /> Assistente
      </button>
    );

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-5 md:right-5 flex h-[min(640px,calc(100vh-40px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <div className="flex items-start justify-between bg-gradient-to-r from-[#0b1f3a] to-[#1e4f9c] px-4 py-3 text-white">
        <div>
          <p className="text-[15px] font-semibold">Assistente do Compass</p>
          <p className="text-[12px] text-white/75">Pergunte sobre os dados ou como usar</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Nova conversa"
            className="rounded-md p-1.5 hover:bg-white/10"
            onClick={() => setMsgs([])}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Fechar"
            className="rounded-md p-1.5 hover:bg-white/10"
            onClick={() => setAberto(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              Posso consultar leads, empresas, negócios, propostas e a carteira do CS, e explicar
              qualquer tela do Compass. Experimente:
            </p>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => enviar(s)}
                className="block w-full rounded-xl border px-3 py-2 text-left text-[13px] hover:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-gradient-to-r from-[#0b1f3a] to-[#1e4f9c] px-3 py-2 text-[13px] text-white">
                {m.content}
              </p>
            </div>
          ) : (
            <div
              key={i}
              className="max-w-[92%] rounded-2xl bg-muted px-3 py-2 text-[13px] leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
            >
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => {
                    const interno = !!href && href.startsWith("/");
                    return (
                      <a
                        href={href}
                        target={interno ? undefined : "_blank"}
                        rel={interno ? undefined : "noreferrer"}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={(e) => {
                          if (!interno || !href) return;
                          e.preventDefault();
                          void navigate({ to: href as never });
                        }}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          ),
        )}
        {perguntar.isPending && (
          <p className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando…
          </p>
        )}
        <div ref={fim} />
      </div>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(texto);
            }
          }}
          rows={2}
          placeholder="Pergunte algo…"
          className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={!texto.trim() || perguntar.isPending}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-[#0b1f3a] to-[#1e4f9c] text-white disabled:opacity-40"
          title="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
