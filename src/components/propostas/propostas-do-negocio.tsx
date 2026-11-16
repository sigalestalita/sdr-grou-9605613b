import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  FileDown,
  FileText,
  History,
  Mail,
  MessageCircle,
  Plus,
  Presentation,
  XCircle,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  cancelarProposta,
  dadosParaProposta,
  enviarPropostaPorEmail,
  gerarProposta,
  listarPropostas,
  marcarPropostaEnviada,
  removerApresentacao,
  salvarApresentacao,
  type PropostaLista,
} from "@/lib/propostas.functions";
import { dataBr, moedaBr, STATUS_PROPOSTA } from "@/lib/propostas/render";
import { duracao, type Rastreio } from "@/lib/propostas/visitas";
import { PUBLIC_SITE_URL } from "@/lib/propostas/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const linkDaProposta = (token: string) => `${PUBLIC_SITE_URL}/proposta/${token}`;

/**
 * Propostas do negócio: gerar a partir dos itens e do modelo, mandar o link
 * (e-mail, WhatsApp ou copiar) e acompanhar se o cliente abriu ou aceitou.
 * Cada nova versão substitui as anteriores ainda sem resposta.
 */
export function PropostasDoNegocio({ dealId }: { dealId: string }) {
  const fn = useServerFn(listarPropostas);
  const { data } = useQuery({
    queryKey: ["propostas", dealId],
    queryFn: () => fn({ data: { dealId } }),
  });
  const [gerando, setGerando] = useState(false);
  const [email, setEmail] = useState<PropostaLista | null>(null);
  const lista = data ?? [];
  const vigentes = lista.filter((p) => !["substituida", "cancelada"].includes(p.status));
  const antigas = lista.filter((p) => ["substituida", "cancelada"].includes(p.status));
  const [verAntigas, setVerAntigas] = useState(false);

  return (
    <section className="surface-panel space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Propostas
        </p>
        <Button size="sm" variant="outline" onClick={() => setGerando(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {lista.length ? "Nova versão" : "Gerar proposta"}
        </Button>
      </div>
      {lista.length === 0 && (
        <p className="text-[12px] text-muted-foreground">
          Nenhuma proposta ainda. Ela sai dos itens acima e do modelo de cada produto.
        </p>
      )}
      <ul className="space-y-2">
        {vigentes.map((p) => (
          <LinhaProposta key={p.id} p={p} dealId={dealId} onEmail={() => setEmail(p)} />
        ))}
        {verAntigas && antigas.map((p) => <LinhaProposta key={p.id} p={p} dealId={dealId} />)}
      </ul>
      {antigas.length > 0 && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => setVerAntigas((v) => !v)}
        >
          {verAntigas ? "Esconder" : "Ver"} versões antigas ({antigas.length})
        </button>
      )}
      {gerando && <GerarPropostaDialog dealId={dealId} onClose={() => setGerando(false)} />}
      {email && <EmailDialog p={email} dealId={dealId} onClose={() => setEmail(null)} />}
    </section>
  );
}

function LinhaProposta({
  p,
  dealId,
  onEmail,
}: {
  p: PropostaLista;
  dealId: string;
  onEmail?: () => void;
}) {
  const qc = useQueryClient();
  const marcar = useServerFn(marcarPropostaEnviada);
  const cancelar = useServerFn(cancelarProposta);
  const st = STATUS_PROPOSTA[p.status] ?? STATUS_PROPOSTA.rascunho;
  const link = linkDaProposta(p.token);
  const ativa = !["substituida", "cancelada"].includes(p.status);
  const atualizar = () => qc.invalidateQueries({ queryKey: ["propostas", dealId] });
  const [apresentando, setApresentando] = useState(false);
  const [historico, setHistorico] = useState(false);
  const nSlides = p.conteudo.apresentacao?.slides?.length ?? 0;

  const copiar = async () => {
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
    if (p.status === "rascunho") await marcar({ data: { id: p.id, para: null } }).then(atualizar);
  };
  const whatsapp = async () => {
    const texto = `Olá! Segue a proposta da Grou: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    if (p.status === "rascunho")
      await marcar({ data: { id: p.id, para: "WhatsApp" } }).then(atualizar);
  };

  return (
    <li className="space-y-1.5 rounded-md border p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">
            Nº {p.numero} · v{p.versao}{" "}
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${st.tom}`}>
              {st.rotulo}
            </span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {p.modelos.join(" + ")} · {moedaBr(p.valorFinal)}
            {p.validadeAte ? ` · até ${dataBr(p.validadeAte)}` : ""}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {p.aceitaEm
          ? `Aceita por ${p.aceite?.nome ?? "—"}${p.aceite?.cargo ? ` (${p.aceite.cargo})` : ""} em ${new Date(p.aceitaEm).toLocaleString("pt-BR")}`
          : p.recusadaEm
            ? `Recusada em ${new Date(p.recusadaEm).toLocaleDateString("pt-BR")}${p.recusaMotivo ? `: ${p.recusaMotivo}` : ""}`
            : p.visualizadaEm
              ? `Aberta ${p.visualizacoes}× · 1ª vez em ${new Date(p.visualizadaEm).toLocaleString("pt-BR")}`
              : p.enviadaEm
                ? `Enviada em ${new Date(p.enviadaEm).toLocaleString("pt-BR")}${p.enviadaPara ? ` para ${p.enviadaPara}` : ""} · ainda não aberta`
                : `Rascunho de ${p.autor ?? "—"} · ainda não enviada`}
      </p>
      {nSlides > 0 && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Presentation className="h-3 w-3" /> Apresentação: {p.conteudo.apresentacao?.titulo} ·{" "}
          {nSlides} slides
        </p>
      )}
      <ResumoRastreio r={p.rastreio} visualizacoes={p.visualizacoes} />
      {p.visitas.length > 0 && (
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => setHistorico((v) => !v)}
          >
            <History className="h-3 w-3" /> {historico ? "Esconder" : "Ver"} histórico de visitas (
            {p.visitas.length})
          </button>
          {historico && <HistoricoVisitas p={p} />}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        <Acao
          icon={Eye}
          rotulo="Ver como o cliente vê"
          onClick={() => window.open(`${link}?previa=1`, "_blank")}
        />
        {p.status === "rascunho" && (
          <Acao
            icon={Presentation}
            rotulo={p.conteudo.apresentacao?.slides?.length ? "Trocar apresentação" : "Anexar apresentação"}
            onClick={() => setApresentando(true)}
          />
        )}
        <Acao
          icon={FileDown}
          rotulo="PDF"
          onClick={() => window.open(`${link}?imprimir=1`, "_blank")}
        />
        {ativa && p.status !== "aceita" && p.status !== "recusada" && (
          <>
            {onEmail && <Acao icon={Mail} rotulo="E-mail" onClick={onEmail} />}
            <Acao icon={MessageCircle} rotulo="WhatsApp" onClick={whatsapp} />
            <Acao icon={Copy} rotulo="Copiar link" onClick={copiar} />
            <Acao
              icon={XCircle}
              rotulo="Cancelar"
              onClick={async () => {
                if (!confirm("Cancelar esta proposta? O link deixa de valer.")) return;
                await cancelar({ data: { id: p.id } });
                atualizar();
              }}
            />
          </>
        )}
      </div>
      {apresentando && (
        <ApresentacaoDialog p={p} onClose={() => setApresentando(false)} onFeito={atualizar} />
      )}
    </li>
  );
}

export function haQuanto(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Aberturas, primeira e última, slides vistos e tempo de leitura. */
function ResumoRastreio({ r, visualizacoes }: { r: Rastreio; visualizacoes: number }) {
  if (r.aberturas === 0) return null;
  const recente = !!r.ultima && Date.now() - new Date(r.ultima).getTime() < 24 * 3600 * 1000;
  const n = Math.max(visualizacoes, r.aberturas);
  return (
    <div
      className={`rounded-md px-2 py-1.5 text-[11.5px] ${recente ? "bg-primary/10 text-foreground" : "bg-muted/60 text-muted-foreground"}`}
    >
      <p>
        <strong className="font-semibold">Aberta {n}×</strong>
        {r.ultima && <> · última {haQuanto(r.ultima)}</>}
        {r.primeira && <> · 1ª em {dataHora(r.primeira)}</>}
      </p>
      <p>
        {r.totalSlides > 0 && (
          <>
            viu {r.slidesVistos} de {r.totalSlides} slides ·{" "}
          </>
        )}
        {duracao(r.segundos)} de leitura
      </p>
    </div>
  );
}

function HistoricoVisitas({ p }: { p: PropostaLista }) {
  const total = p.rastreio.totalSlides;
  return (
    <ul className="mt-1.5 divide-y rounded-md border text-[11.5px]">
      {p.visitas.map((v, i) => (
        <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2 py-1.5">
          <span className="tabular-nums">{dataHora(v.iniciadaEm)}</span>
          <span className="text-muted-foreground">
            {duracao(v.segundos)}
            {total > 0 && <> · até o slide {v.maiorSlide || "—"} de {total}</>}
            {" · "}
            {v.dispositivo}
          </span>
        </li>
      ))}
    </ul>
  );
}

function useAnexarApresentacao() {
  const salvar = useServerFn(salvarApresentacao);
  const [progresso, setProgresso] = useState<string | null>(null);
  const anexar = async (propostaId: string, arquivo: File) => {
    const { enviarApresentacaoPdf, apagarArquivosDaProposta, pastaDaApresentacao } = await import(
      "@/lib/propostas/apresentacao-arquivos"
    );
    setProgresso("Lendo o PDF…");
    try {
      const ap = await enviarApresentacaoPdf(propostaId, arquivo, (feito, total, etapa) =>
        setProgresso(
          etapa === "lendo"
            ? `Convertendo página ${feito + 1} de ${total}…`
            : `Enviando slide ${Math.min(feito + 1, total)} de ${total}…`,
        ),
      );
      setProgresso("Salvando…");
      await salvar({ data: { id: propostaId, apresentacao: ap } });
      // Troca: apaga os arquivos da apresentação anterior desta proposta.
      await apagarArquivosDaProposta(propostaId, pastaDaApresentacao(propostaId, ap.slides)).catch(
        () => undefined,
      );
      return ap;
    } finally {
      setProgresso(null);
    }
  };
  return { anexar, progresso };
}

function ApresentacaoDialog({
  p,
  onClose,
  onFeito,
}: {
  p: PropostaLista;
  onClose: () => void;
  onFeito: () => void;
}) {
  const remover = useServerFn(removerApresentacao);
  const { anexar, progresso } = useAnexarApresentacao();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const atual = p.conteudo.apresentacao;

  const enviar = async () => {
    if (!arquivo) return;
    setOcupado(true);
    try {
      const ap = await anexar(p.id, arquivo);
      toast.success(`Apresentação anexada · ${ap.slides.length} slides`);
      onFeito();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao anexar");
    } finally {
      setOcupado(false);
    }
  };
  const tirar = async () => {
    if (!confirm("Tirar a apresentação desta proposta?")) return;
    setOcupado(true);
    try {
      await remover({ data: { id: p.id } });
      const { apagarArquivosDaProposta } = await import("@/lib/propostas/apresentacao-arquivos");
      await apagarArquivosDaProposta(p.id).catch(() => undefined);
      toast.success("Apresentação removida");
      onFeito();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apresentação em slides</DialogTitle>
          <DialogDescription>
            Aparece no topo da página do cliente. Envie um PDF: cada página vira um slide.
          </DialogDescription>
        </DialogHeader>
        {atual?.slides?.length ? (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-[12px]">
            Atual: <strong>{atual.titulo}</strong> · {atual.slides.length} slides
          </p>
        ) : null}
        <EscolherPdf arquivo={arquivo} onArquivo={setArquivo} desabilitado={ocupado} />
        {progresso && <p className="text-[12px] text-muted-foreground">{progresso}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          {atual?.slides?.length ? (
            <Button variant="ghost" className="text-destructive" disabled={ocupado} onClick={tirar}>
              Remover apresentação
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" disabled={ocupado} onClick={onClose}>
              Fechar
            </Button>
            <Button disabled={!arquivo || ocupado} onClick={enviar}>
              {ocupado ? "Enviando…" : atual?.slides?.length ? "Trocar" : "Anexar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscolherPdf({
  arquivo,
  onArquivo,
  desabilitado,
}: {
  arquivo: File | null;
  onArquivo: (f: File | null) => void;
  desabilitado?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-[12.5px] text-muted-foreground hover:border-primary ${desabilitado ? "pointer-events-none opacity-60" : ""}`}
    >
      <Presentation className="h-5 w-5" />
      {arquivo ? arquivo.name : "Escolher PDF da apresentação"}
      <span className="text-[11px]">Exporte do Google Slides ou PowerPoint como PDF.</span>
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => onArquivo(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function Acao({
  icon: Icon,
  rotulo,
  onClick,
}: {
  icon: typeof Eye;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <Icon className="h-3 w-3" /> {rotulo}
    </button>
  );
}

function GerarPropostaDialog({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const dadosFn = useServerFn(dadosParaProposta);
  const gerarFn = useServerFn(gerarProposta);
  const { data } = useQuery({
    queryKey: ["dados-proposta", dealId],
    queryFn: () => dadosFn({ data: { dealId } }),
  });
  const [modelos, setModelos] = useState<string[]>([]);
  const [contato, setContato] = useState<string>("");
  const [pagamento, setPagamento] = useState("");
  const [validade, setValidade] = useState(10);
  const [obs, setObs] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const { anexar, progresso } = useAnexarApresentacao();

  useEffect(() => {
    if (!data) return;
    setModelos(data.sugeridos);
    setContato(data.contatos[0]?.id ?? "");
    setPagamento(data.pagamentoSugerido);
    setValidade(data.validadeDias);
  }, [data]);

  const gerar = useMutation({
    mutationFn: () =>
      gerarFn({
        data: {
          dealId,
          modeloIds: modelos,
          contactId: contato || null,
          pagamento,
          validadeDias: validade,
          observacoes: obs,
        },
      }),
    onSuccess: async (r) => {
      qc.invalidateQueries({ queryKey: ["propostas", dealId] });
      if (!pdf) {
        toast.success(`Proposta nº ${r.numero} gerada`);
        window.open(`${linkDaProposta(r.token)}?previa=1`, "_blank");
        onClose();
        return;
      }
      try {
        const ap = await anexar(r.id, pdf);
        toast.success(`Proposta nº ${r.numero} gerada com ${ap.slides.length} slides`, {
          action: {
            label: "Ver",
            onClick: () => window.open(`${linkDaProposta(r.token)}?previa=1`, "_blank"),
          },
        });
      } catch (e) {
        toast.error(
          `Proposta nº ${r.numero} gerada, mas a apresentação falhou: ${e instanceof Error ? e.message : "erro"}. Tente de novo em “Anexar apresentação”.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["propostas", dealId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const alterna = (id: string) =>
    setModelos((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar proposta</DialogTitle>
          <DialogDescription>
            Itens, descontos e impostos vêm do negócio. O texto vem do modelo de cada produto.
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <p className="text-[13px] text-muted-foreground">Carregando…</p>
        ) : !data.temItens ? (
          <p className="text-[13px] text-destructive">
            Adicione os itens do negócio (catálogo) antes de gerar a proposta.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Modelo (o primeiro dá o cabeçalho; os outros somam seções)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {data.modelos.map((m) => {
                  const ordem = modelos.indexOf(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => alterna(m.id)}
                      className={`rounded-full border px-2.5 py-1 text-[12px] ${
                        ordem >= 0
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {ordem >= 0 ? `${ordem + 1}. ` : ""}
                      {m.nome}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">A/C (contato)</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
              >
                <option value="">— sem contato —</option>
                {data.contatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome ?? "Sem nome"}
                    {c.cargo ? ` · ${c.cargo}` : ""}
                    {c.principal ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Forma de pagamento</Label>
              <Input value={pagamento} onChange={(e) => setPagamento(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Validade (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                className="w-28"
                value={validade}
                onChange={(e) => setValidade(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Observações (aparecem na proposta)</Label>
              <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">
                Apresentação em slides (opcional; sem PDF, mantém a da versão anterior, se houver)
              </Label>
              <EscolherPdf arquivo={pdf} onArquivo={setPdf} desabilitado={gerar.isPending} />
              {progresso && <p className="text-[12px] text-muted-foreground">{progresso}</p>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            disabled={!data?.temItens || modelos.length === 0 || gerar.isPending}
            onClick={() => gerar.mutate()}
          >
            {gerar.isPending || progresso ? "Gerando…" : "Gerar e ver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({
  p,
  dealId,
  onClose,
}: {
  p: PropostaLista;
  dealId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(enviarPropostaPorEmail);
  const dadosFn = useServerFn(dadosParaProposta);
  const { data } = useQuery({
    queryKey: ["dados-proposta", dealId],
    queryFn: () => dadosFn({ data: { dealId } }),
  });
  const contato = p.conteudo.cliente.contato;
  const [para, setPara] = useState("");
  const [assunto, setAssunto] = useState(`Proposta comercial Grou · ${p.conteudo.cliente.empresa}`);
  const [msg, setMsg] = useState(
    `Olá${contato ? `, ${contato.split(" ")[0]}` : ""}!\n\nConforme conversamos, segue a proposta comercial da Grou. Pelo link você vê todos os detalhes, baixa o PDF e pode dar o aceite.\n\nQualquer dúvida, é só responder este e-mail.\n\n${p.conteudo.executivo.nome}`,
  );
  useEffect(() => {
    if (para || !data) return;
    const c =
      data.contatos.find((x) => x.nome === contato && x.email) ??
      data.contatos.find((x) => x.email);
    if (c?.email) setPara(c.email);
  }, [data, contato, para]);

  const enviar = useMutation({
    mutationFn: () => fn({ data: { id: p.id, para, assunto, mensagem: msg } }),
    onSuccess: () => {
      toast.success("Proposta enviada");
      qc.invalidateQueries({ queryKey: ["propostas", dealId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar por e-mail</DialogTitle>
          <DialogDescription>
            Sai de noreply@grougp.com.br com o seu nome; a resposta do cliente vai para o seu
            e-mail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Para</Label>
            <Input type="email" value={para} onChange={(e) => setPara(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Assunto</Label>
            <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Mensagem (o botão com o link vai embaixo)</Label>
            <Textarea rows={8} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!para || enviar.isPending} onClick={() => enviar.mutate()}>
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
