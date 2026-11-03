import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Eye, FileDown, FileText, Mail, MessageCircle, Plus, XCircle } from "lucide-react";
import {
  cancelarProposta,
  dadosParaProposta,
  enviarPropostaPorEmail,
  gerarProposta,
  listarPropostas,
  marcarPropostaEnviada,
  type PropostaLista,
} from "@/lib/propostas.functions";
import { dataBr, moedaBr, STATUS_PROPOSTA } from "@/lib/propostas/render";
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
      <div className="flex flex-wrap gap-1">
        <Acao icon={Eye} rotulo="Ver" onClick={() => window.open(`${link}?previa=1`, "_blank")} />
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
    </li>
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
    onSuccess: (r) => {
      toast.success(`Proposta nº ${r.numero} gerada`);
      qc.invalidateQueries({ queryKey: ["propostas", dealId] });
      window.open(`${linkDaProposta(r.token)}?previa=1`, "_blank");
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
            {gerar.isPending ? "Gerando…" : "Gerar e ver"}
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
