import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import {
  aceitarProposta,
  recusarProposta,
  TEXTO_CIENCIA,
  verPropostaPublica,
} from "@/lib/propostas-publico.functions";
import { DocumentoProposta } from "@/components/propostas/documento-proposta";
import { dataBr, moedaBr } from "@/lib/propostas/render";

type Busca = { imprimir?: boolean; previa?: boolean };

export const Route = createFileRoute("/proposta/$token")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    imprimir: s.imprimir === true || s.imprimir === "1" || s.imprimir === 1,
    previa: s.previa === true || s.previa === "1" || s.previa === 1,
  }),
  head: () => ({
    meta: [
      { title: "Proposta comercial · Grou" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PropostaPublica,
});

type Dados = Awaited<ReturnType<typeof verPropostaPublica>>;

/**
 * O que o cliente abre pelo link: a proposta, o botão de baixar em PDF e o
 * aceite (nome, e-mail, cargo e a declaração de ciência). Sem login.
 * ?previa=1 é a prévia do executivo (não conta como visualização do cliente);
 * ?imprimir=1 abre direto a janela de salvar em PDF.
 */
function PropostaPublica() {
  const { token } = Route.useParams();
  const { imprimir, previa } = Route.useSearch();
  const ver = useServerFn(verPropostaPublica);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const jaImprimiu = useRef(false);

  const carregar = (contar: boolean) =>
    ver({ data: { token, contar } })
      .then(setD)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao abrir a proposta"));

  useEffect(() => {
    void carregar(!previa && !imprimir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (imprimir && d?.encontrada && !jaImprimiu.current) {
      jaImprimiu.current = true;
      setTimeout(() => window.print(), 400);
    }
  }, [imprimir, d]);

  if (erro) return <Aviso titulo="Não foi possível abrir a proposta" texto={erro} />;
  if (!d) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#eceef1]">
        <Loader2 className="h-6 w-6 animate-spin text-[#05104c]" />
      </div>
    );
  }
  if (!d.encontrada) {
    return (
      <Aviso titulo="Proposta não encontrada" texto="Confira o link ou fale com quem enviou." />
    );
  }

  const fora = d.status === "substituida" || d.status === "cancelada";
  return (
    <div className="min-h-[100dvh] bg-[#eceef1] pb-16 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-[13px] text-[#444]">
            Proposta nº {d.numero} · <strong>{moedaBr(d.conteudo.totais.final)}</strong>
            {d.conteudo.validadeAte && <> · válida até {dataBr(d.conteudo.validadeAte)}</>}
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#05104c]/20 px-4 py-1.5 text-[13px] font-medium text-[#05104c] hover:bg-[#05104c]/5"
          >
            <Download className="h-4 w-4" /> Baixar PDF
          </button>
        </div>
      </div>

      {previa && (
        <p className="mx-auto mt-4 max-w-[820px] rounded-lg bg-amber-100 px-4 py-2 text-[12px] text-amber-900 print:hidden">
          Prévia de quem envia: esta visita não conta como abertura do cliente.
        </p>
      )}
      {fora && (
        <p className="mx-auto mt-4 max-w-[820px] rounded-lg bg-[#fff1f0] px-4 py-3 text-[13px] text-[#a8071a] print:hidden">
          Esta versão da proposta não está mais valendo. Fale com a Grou para receber a atual.
        </p>
      )}

      <div className="mx-auto mt-4 max-w-[820px] overflow-hidden rounded-xl shadow-sm print:mt-0 print:rounded-none print:shadow-none">
        <DocumentoProposta c={d.conteudo} numero={d.numero} versao={d.versao} />
      </div>

      {!fora && !previa && (
        <div className="mx-auto mt-6 max-w-[820px] print:hidden">
          <Aceite token={token} d={d} onFeito={() => carregar(false)} />
        </div>
      )}
    </div>
  );
}

function Aceite({
  token,
  d,
  onFeito,
}: {
  token: string;
  d: Extract<Dados, { encontrada: true }>;
  onFeito: () => void;
}) {
  const aceitar = useServerFn(aceitarProposta);
  const recusar = useServerFn(recusarProposta);
  const [f, setF] = useState({ nome: "", email: "", cargo: "", documento: "" });
  const [concordo, setConcordo] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (d.status === "aceita") {
    return (
      <Cartao>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[#0b6b3a]">
          <CheckCircle2 className="h-5 w-5" /> Proposta aceita
        </p>
        <p className="mt-1 text-[13px] text-[#555]">
          {d.aceite?.nome}
          {d.aceite?.cargo ? ` (${d.aceite.cargo})` : ""} aceitou em{" "}
          {d.aceitaEm ? new Date(d.aceitaEm).toLocaleString("pt-BR") : ""}. A Grou já foi avisada e
          segue com os próximos passos.
        </p>
      </Cartao>
    );
  }
  if (d.status === "recusada") {
    return (
      <Cartao>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[#a8071a]">
          <XCircle className="h-5 w-5" /> Proposta recusada
        </p>
        <p className="mt-1 text-[13px] text-[#555]">A Grou foi avisada. Obrigado pelo retorno.</p>
      </Cartao>
    );
  }
  if (d.vencida) {
    return (
      <Cartao>
        <p className="text-[14px] text-[#555]">
          A validade desta proposta terminou. Fale com a Grou para receber uma atualizada.
        </p>
      </Cartao>
    );
  }

  const campo =
    "h-11 w-full rounded-lg border border-[#d5d8de] bg-white px-3 text-[14px] text-[#222] outline-none focus:border-[#05104c] focus:ring-2 focus:ring-[#05104c]/15";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await aceitar({ data: { token, ...f, concordo: true } });
      onFeito();
    } catch (er) {
      setErro(er instanceof Error ? er.message : "Erro ao registrar o aceite");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarRecusa() {
    setEnviando(true);
    try {
      await recusar({ data: { token, motivo } });
      onFeito();
    } catch (er) {
      setErro(er instanceof Error ? er.message : "Erro");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao>
      <h2 className="text-[17px] font-bold text-[#05104c]">Aceite da proposta</h2>
      <p className="mt-1 text-[13px] text-[#666]">
        Preencha com os dados de quem aprova a contratação.
      </p>
      <form onSubmit={enviar} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          className={campo}
          placeholder="Nome completo"
          value={f.nome}
          onChange={(e) => setF({ ...f, nome: e.target.value })}
          required
          minLength={3}
          autoComplete="name"
        />
        <input
          className={campo}
          placeholder="Cargo"
          value={f.cargo}
          onChange={(e) => setF({ ...f, cargo: e.target.value })}
          required
          minLength={2}
          autoComplete="organization-title"
        />
        <input
          className={campo}
          type="email"
          placeholder="E-mail"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          required
          autoComplete="email"
        />
        <input
          className={campo}
          placeholder="CPF (opcional)"
          value={f.documento}
          onChange={(e) => setF({ ...f, documento: e.target.value })}
          inputMode="numeric"
        />
        <label className="flex items-start gap-2 text-[13px] text-[#444] sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#05104c]"
            checked={concordo}
            onChange={(e) => setConcordo(e.target.checked)}
            required
          />
          <span>{TEXTO_CIENCIA}</span>
        </label>
        {erro && <p className="text-[13px] text-[#a8071a] sm:col-span-2">{erro}</p>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={!concordo || enviando}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#05104c] px-6 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Aceitar proposta
          </button>
          {!recusando ? (
            <button
              type="button"
              className="text-[13px] text-[#888] underline-offset-4 hover:underline"
              onClick={() => setRecusando(true)}
            >
              Não vou seguir
            </button>
          ) : null}
        </div>
      </form>
      {recusando && (
        <div className="mt-4 space-y-2 border-t border-[#eee] pt-4">
          <p className="text-[13px] text-[#444]">Pode contar o motivo? (opcional)</p>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-[#d5d8de] p-3 text-[14px]"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              type="button"
              disabled={enviando}
              onClick={confirmarRecusa}
              className="h-10 rounded-full border border-[#a8071a]/40 px-5 text-[13px] font-medium text-[#a8071a]"
            >
              Confirmar recusa
            </button>
            <button
              type="button"
              className="text-[13px] text-[#888]"
              onClick={() => setRecusando(false)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </Cartao>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-white p-6 shadow-sm">{children}</div>;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#eceef1] px-6">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <p className="text-[17px] font-bold text-[#05104c]">{titulo}</p>
        <p className="mt-2 text-[14px] text-[#666]">{texto}</p>
      </div>
    </div>
  );
}
