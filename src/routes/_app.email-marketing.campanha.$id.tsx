import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Copy,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  Save,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  acaoCampanha,
  apagarCampanha,
  duplicarCampanha,
  enviarTesteCampanha,
  escreverComIa,
  listarSegmentos,
  salvarCampanha,
  subirImagemTopo,
  verCampanha,
  type CampanhaCompleta,
  type CampanhaEditavel,
  type EnvioDaCampanha,
} from "@/lib/email-marketing.functions";
import { renderEmail, variaveisDesconhecidas } from "@/lib/email-marketing/render";
import { useAuth } from "@/lib/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/email-marketing/campanha/$id")({
  component: CampanhaPage,
  head: () => ({ meta: [{ title: "Campanha de e-mail | Grou Compass" }] }),
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
const STATUS_ENVIO: Record<string, string> = {
  pendente: "Na fila",
  enviado: "Enviado",
  falhou: "Falhou",
  suprimido: "Suprimido",
};
const EDITAVEIS = ["rascunho", "agendada", "pausada"];
const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-[13px]";
const CONTATO_EXEMPLO = {
  nome: "Maria Silva",
  empresa: "Empresa Exemplo",
  email: "maria@exemplo.com",
};
const REMETENTE_OK = /^[^@\s]+@grougp\.com\.br$/i;
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    : "—";
const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro");

/** "AAAA-MM-DDTHH:mm" no fuso local (para o input datetime-local). */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Form = Omit<CampanhaEditavel, "id">;

function formDe(c: CampanhaCompleta): Form {
  return {
    nome: c.nome ?? "",
    segmento_id: c.segmento_id ?? null,
    assunto: c.assunto ?? "",
    preheader: c.preheader ?? null,
    corpo: c.corpo ?? "",
    formato: c.formato === "html" ? "html" : "texto",
    remetente_nome: c.remetente_nome || "Grou",
    remetente_email: c.remetente_email || "marketing@grougp.com.br",
    responder_para: c.responder_para ?? null,
    imagem_topo: c.imagem_topo ?? null,
  };
}

function CampanhaPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(verCampanha);
  const { data, isLoading, error } = useQuery({
    queryKey: ["email-mkt", "campanha", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (q) => (q.state.data?.campanha.status === "enviando" ? 30_000 : false),
  });

  if (isLoading) return <p className="p-6 text-[13px] text-muted-foreground">Carregando…</p>;
  if (error || !data)
    return (
      <div className="space-y-3 p-6">
        <p className="text-[13px] text-destructive">
          {error instanceof Error ? error.message : "Campanha não encontrada"}
        </p>
        <Link to="/email-marketing" className="text-[13px] underline">
          Voltar às campanhas
        </Link>
      </div>
    );

  const c = data.campanha;
  const st = STATUS[c.status] ?? STATUS.rascunho;
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/email-marketing"
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
        </Link>
        <span className="text-muted-foreground">/</span>
        <h2 className="min-w-0 truncate text-lg font-semibold">{c.nome}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tom}`}>
          {st.rotulo}
        </span>
        {c.status === "agendada" && c.agendada_para && (
          <span className="text-[12px] text-muted-foreground">
            para {dataHora(c.agendada_para)}
          </span>
        )}
      </div>
      {EDITAVEIS.includes(c.status) ? (
        <Editor key={c.id} campanha={c} />
      ) : (
        <Painel campanha={c} metricas={data.metricas} envios={data.envios} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ editor
function Editor({ campanha }: { campanha: CampanhaCompleta }) {
  const id = campanha.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const salvarFn = useServerFn(salvarCampanha);
  const acaoFn = useServerFn(acaoCampanha);
  const testeFn = useServerFn(enviarTesteCampanha);
  const apagarFn = useServerFn(apagarCampanha);
  const duplicarFn = useServerFn(duplicarCampanha);
  const segmentosFn = useServerFn(listarSegmentos);

  const [form, setForm] = useState<Form>(() => formDe(campanha));
  const [salvo, setSalvo] = useState(() => JSON.stringify(formDe(campanha)));
  const sujo = JSON.stringify(form) !== salvo;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const [testeAberto, setTesteAberto] = useState(false);
  const [testePara, setTestePara] = useState("");
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [quando, setQuando] = useState(() =>
    localInput(
      campanha.agendada_para
        ? new Date(campanha.agendada_para)
        : new Date(Date.now() + 60 * 60 * 1000),
    ),
  );

  const { data: segmentos } = useQuery({
    queryKey: ["email-mkt", "segmentos"],
    queryFn: () => segmentosFn(),
  });
  const segmento = segmentos?.find((s) => s.id === form.segmento_id) ?? null;

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["email-mkt", "campanha", id] });
    qc.invalidateQueries({ queryKey: ["email-mkt", "campanhas"] });
    qc.invalidateQueries({ queryKey: ["email-mkt", "situacao"] });
  };

  const validar = (): string | null => {
    if (!form.nome.trim()) return "Dê um nome à campanha";
    if (!form.remetente_nome.trim()) return "Informe o nome do remetente";
    if (!REMETENTE_OK.test(form.remetente_email.trim()))
      return "O remetente precisa ser um e-mail @grougp.com.br";
    if (form.responder_para && !EMAIL_OK.test(form.responder_para.trim()))
      return "“Responder para” não é um e-mail válido";
    return null;
  };

  const salvarAgora = async () => {
    const msg = validar();
    if (msg) throw new Error(msg);
    const dados: CampanhaEditavel = {
      id,
      ...form,
      nome: form.nome.trim(),
      remetente_nome: form.remetente_nome.trim(),
      remetente_email: form.remetente_email.trim(),
      preheader: form.preheader?.trim() ? form.preheader : null,
      responder_para: form.responder_para?.trim() ? form.responder_para.trim() : null,
      imagem_topo: form.imagem_topo?.trim() ? form.imagem_topo.trim() : null,
    };
    await salvarFn({ data: dados });
    setSalvo(JSON.stringify(form));
  };

  const salvar = useMutation({
    mutationFn: salvarAgora,
    onSuccess: () => {
      toast.success("Campanha salva");
      atualizar();
    },
    onError: erro,
  });

  const exigeConteudo = () => {
    if (!form.assunto.trim()) throw new Error("Escreva o assunto");
    if (!form.corpo.trim()) throw new Error("Escreva o corpo do e-mail");
  };

  const teste = useMutation({
    mutationFn: async () => {
      if (!EMAIL_OK.test(testePara.trim())) throw new Error("Informe um e-mail válido");
      exigeConteudo();
      await salvarAgora();
      return testeFn({ data: { id, para: testePara.trim() } });
    },
    onSuccess: () => {
      toast.success(`Teste enviado para ${testePara.trim()}`);
      setTesteAberto(false);
    },
    onError: erro,
  });

  const acao = useMutation({
    mutationFn: async (p: {
      acao: "enviar" | "agendar" | "retomar" | "cancelar" | "voltar_rascunho";
      quando?: string;
    }) => {
      if (p.acao === "enviar" || p.acao === "agendar" || p.acao === "retomar") {
        if (!form.segmento_id) throw new Error("Escolha uma segmentação");
        exigeConteudo();
        await salvarAgora();
      }
      return acaoFn({ data: { id, ...p } });
    },
    onSuccess: (_r, p) => {
      toast.success(
        p.acao === "enviar"
          ? "Envio iniciado"
          : p.acao === "agendar"
            ? "Campanha agendada"
            : p.acao === "retomar"
              ? "Envio retomado"
              : p.acao === "cancelar"
                ? "Campanha cancelada"
                : "Voltou a rascunho",
      );
      setAgendarAberto(false);
      atualizar();
    },
    onError: erro,
  });

  const apagar = useMutation({
    mutationFn: () => apagarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Campanha apagada");
      qc.invalidateQueries({ queryKey: ["email-mkt", "campanhas"] });
      navigate({ to: "/email-marketing" });
    },
    onError: erro,
  });

  const duplicar = useMutation({
    mutationFn: () => duplicarFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success("Cópia criada");
      qc.invalidateQueries({ queryKey: ["email-mkt", "campanhas"] });
      navigate({ to: "/email-marketing/campanha/$id", params: { id: r.id } });
    },
    onError: erro,
  });

  const ocupado = salvar.isPending || teste.isPending || acao.isPending || apagar.isPending;
  const status = campanha.status;
  const contagem = segmento?.ultima_contagem ?? null;

  const enviarAgora = () => {
    if (!form.segmento_id) return toast.error("Escolha uma segmentação");
    const n = contagem != null ? contagem.toLocaleString("pt-BR") : "todos os";
    const verbo = status === "pausada" ? "Retomar o envio" : "Enviar agora";
    if (
      !window.confirm(
        `${verbo} para ${n} destinatário(s) da segmentação “${segmento?.nome ?? ""}”?\n\nDescadastrados ficam de fora. O envio respeita o limite diário.`,
      )
    )
      return;
    acao.mutate({ acao: status === "pausada" ? "retomar" : "enviar" });
  };

  const agendar = () => {
    const d = new Date(quando);
    if (Number.isNaN(d.getTime())) return toast.error("Data inválida");
    if (d.getTime() < Date.now()) return toast.error("Escolha uma data futura");
    acao.mutate({ acao: "agendar", quando: d.toISOString() });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="min-w-0 space-y-4">
        {/* 1. Nome e segmentação */}
        <Secao n={1} titulo="Nome e segmentação">
          <Campo rotulo="Nome da campanha (interno)">
            <Input
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              maxLength={160}
              className="text-[13px]"
            />
          </Campo>
          <Campo rotulo="Quem recebe">
            <select
              className={SELECT}
              value={form.segmento_id ?? ""}
              onChange={(e) => set("segmento_id", e.target.value || null)}
            >
              <option value="">Escolha uma segmentação…</option>
              {(segmentos ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {s.ultima_contagem != null
                    ? ` (${s.ultima_contagem.toLocaleString("pt-BR")})`
                    : ""}
                </option>
              ))}
            </select>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {segmento
                  ? `${(segmento.ultima_contagem ?? 0).toLocaleString("pt-BR")} contatos na última contagem${segmento.contado_em ? ` (${dataHora(segmento.contado_em)})` : ""}`
                  : "A lista final é montada na hora do envio."}
              </span>
              <Link to="/email-marketing/segmentos" className="text-primary hover:underline">
                Criar segmentação
              </Link>
            </div>
          </Campo>
        </Secao>

        {/* 2. Remetente */}
        <Secao n={2} titulo="Remetente">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Input
                value={form.remetente_nome}
                onChange={(e) => set("remetente_nome", e.target.value)}
                maxLength={80}
                className="text-[13px]"
              />
            </Campo>
            <Campo
              rotulo="E-mail"
              erro={
                form.remetente_email && !REMETENTE_OK.test(form.remetente_email.trim())
                  ? "Precisa terminar em @grougp.com.br"
                  : undefined
              }
            >
              <Input
                type="email"
                value={form.remetente_email}
                onChange={(e) => set("remetente_email", e.target.value)}
                placeholder="marketing@grougp.com.br"
                className="text-[13px]"
              />
            </Campo>
          </div>
          <Campo rotulo="Responder para (opcional)">
            <Input
              type="email"
              value={form.responder_para ?? ""}
              onChange={(e) => set("responder_para", e.target.value || null)}
              placeholder="Se vazio, as respostas vão para o remetente"
              className="text-[13px]"
            />
          </Campo>
        </Secao>

        {/* 3. Conteúdo */}
        <Secao n={3} titulo="Conteúdo">
          <Conteudo form={form} set={set} setForm={setForm} />
        </Secao>

        {/* 4. Revisar e enviar */}
        <Secao n={4} titulo="Revisar e enviar">
          <ul className="space-y-1 text-[12px] text-muted-foreground">
            <Item ok={!!form.segmento_id}>
              {segmento
                ? `Segmentação: ${segmento.nome} (${(segmento.ultima_contagem ?? 0).toLocaleString("pt-BR")})`
                : "Sem segmentação escolhida"}
            </Item>
            <Item ok={!!form.assunto.trim()}>
              {form.assunto.trim() ? `Assunto: ${form.assunto}` : "Sem assunto"}
            </Item>
            <Item ok={!!form.corpo.trim()}>
              {form.corpo.trim() ? "Corpo escrito" : "Corpo vazio"}
            </Item>
            <Item ok={REMETENTE_OK.test(form.remetente_email.trim())}>
              De: {form.remetente_nome} &lt;{form.remetente_email}&gt;
            </Item>
          </ul>
          {status === "pausada" && (
            <p className="rounded-md bg-orange-50 p-2 text-[12px] text-orange-800 dark:bg-orange-900/30 dark:text-orange-200">
              Envio pausado. Ao retomar, a fila continua de onde parou.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => salvar.mutate()} disabled={ocupado}>
              {salvar.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Salvar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => {
                setTestePara((t) => t || user?.email || "");
                setTesteAberto(true);
              }}
            >
              <Send className="mr-1 h-3.5 w-3.5" /> Enviar teste
            </Button>
            {status === "pausada" ? (
              <Button size="sm" onClick={enviarAgora} disabled={ocupado}>
                <Play className="mr-1 h-3.5 w-3.5" /> Retomar
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={enviarAgora} disabled={ocupado}>
                  {acao.isPending && acao.variables?.acao === "enviar" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-3.5 w-3.5" />
                  )}
                  Enviar agora
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAgendarAberto((v) => !v)}
                  disabled={ocupado}
                >
                  <CalendarClock className="mr-1 h-3.5 w-3.5" />
                  {status === "agendada" ? "Reagendar" : "Agendar"}
                </Button>
              </>
            )}
            {status === "agendada" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => acao.mutate({ acao: "voltar_rascunho" })}
                disabled={ocupado}
              >
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Voltar a rascunho
              </Button>
            )}
            {(status === "agendada" || status === "pausada") && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm("Cancelar esta campanha? Os e-mails na fila não saem."))
                    acao.mutate({ acao: "cancelar" });
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Cancelar
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado || duplicar.isPending}
              onClick={() => duplicar.mutate()}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
            </Button>
            {status === "rascunho" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm("Apagar este rascunho?")) apagar.mutate();
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar
              </Button>
            )}
          </div>
          {agendarAberto && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <Campo rotulo="Enviar em">
                <Input
                  type="datetime-local"
                  value={quando}
                  min={localInput(new Date())}
                  onChange={(e) => setQuando(e.target.value)}
                  className="w-auto text-[13px]"
                />
              </Campo>
              <Button size="sm" onClick={agendar} disabled={ocupado}>
                {acao.isPending && acao.variables?.acao === "agendar" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CalendarClock className="mr-1 h-3.5 w-3.5" />
                )}
                Confirmar agendamento
              </Button>
            </div>
          )}
          {sujo && <p className="text-[11px] text-amber-600">Há alterações não salvas.</p>}
          <p className="text-[11px] text-muted-foreground">
            Teste, envio e agendamento salvam a campanha antes.
          </p>
        </Secao>
      </div>

      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <Previa form={form} />
      </div>

      <Dialog open={testeAberto} onOpenChange={setTesteAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar teste</DialogTitle>
            <DialogDescription>
              O teste usa seus dados nas variáveis e não conta nas métricas.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="email"
            value={testePara}
            onChange={(e) => setTestePara(e.target.value)}
            placeholder="seu@email.com"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") teste.mutate();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTesteAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => teste.mutate()} disabled={teste.isPending}>
              {teste.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Imagem do topo do e-mail: sem nada, vai o logo da Grou. Dá para subir uma
 * imagem (banner de 600 px de largura fica melhor) ou colar o endereço dela.
 */
function ImagemDoTopo({
  valor,
  onChange,
}: {
  valor: string | null;
  onChange: (v: string | null) => void;
}) {
  const subirFn = useServerFn(subirImagemTopo);
  const subir = useMutation({
    mutationFn: async (arquivo: File) => {
      if (arquivo.size > 2 * 1024 * 1024) throw new Error("Imagem acima de 2 MB");
      const base64 = await new Promise<string>((ok, falha) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1] ?? "");
        r.onerror = () => falha(new Error("Não deu para ler o arquivo"));
        r.readAsDataURL(arquivo);
      });
      return subirFn({ data: { tipo: arquivo.type, base64 } });
    },
    onSuccess: (r) => {
      onChange(r.url);
      toast.success("Imagem do topo atualizada");
    },
    onError: erro,
  });
  return (
    <Campo rotulo="Imagem do topo">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-[12px] font-medium hover:bg-muted">
            {subir.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            {valor ? "Trocar imagem" : "Subir imagem"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              disabled={subir.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subir.mutate(f);
                e.target.value = "";
              }}
            />
          </label>
          {valor && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[12px]"
              onClick={() => onChange(null)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Voltar ao logo da Grou
            </Button>
          )}
        </div>
        <Input
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          placeholder="ou cole o endereço https da imagem"
          className="text-[13px]"
        />
        <p className="text-[11px] text-muted-foreground">
          Sem imagem, o e-mail sai com o logo da Grou no topo. Para um banner, use 600 px de largura
          (PNG ou JPG, até 2 MB).
        </p>
      </div>
    </Campo>
  );
}

function Conteudo({
  form,
  set,
  setForm,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  setForm: Dispatch<SetStateAction<Form>>;
}) {
  const iaFn = useServerFn(escreverComIa);
  const [iaAberta, setIaAberta] = useState(false);
  const [briefing, setBriefing] = useState("");
  const ia = useMutation({
    mutationFn: () =>
      iaFn({
        data: {
          briefing: briefing.trim(),
          atual: form.corpo.trim()
            ? `Assunto: ${form.assunto}\nPré-cabeçalho: ${form.preheader ?? ""}\n\n${form.corpo}`.slice(
                0,
                20000,
              )
            : undefined,
        },
      }),
    onSuccess: (r) => {
      setForm((f) => ({
        ...f,
        assunto: r.assunto || f.assunto,
        preheader: r.preheader || f.preheader,
        corpo: r.corpo || f.corpo,
        formato: r.corpo ? "texto" : f.formato,
      }));
      toast.success("Texto escrito — revise antes de enviar");
      setIaAberta(false);
    },
    onError: erro,
  });
  const desconhecidas = useMemo(
    () => variaveisDesconhecidas(`${form.assunto}\n${form.preheader ?? ""}\n${form.corpo}`),
    [form.assunto, form.preheader, form.corpo],
  );

  return (
    <>
      <Campo rotulo="Assunto">
        <Input
          value={form.assunto}
          onChange={(e) => set("assunto", e.target.value)}
          maxLength={200}
          placeholder="Ex.: {{primeiro_nome|Olá}}, uma novidade para {{empresa}}"
          className="text-[13px]"
        />
      </Campo>
      <ImagemDoTopo valor={form.imagem_topo ?? null} onChange={(v) => set("imagem_topo", v)} />
      <Campo rotulo="Pré-cabeçalho (aparece ao lado do assunto na caixa de entrada)">
        <Input
          value={form.preheader ?? ""}
          onChange={(e) => set("preheader", e.target.value || null)}
          maxLength={200}
          className="text-[13px]"
        />
      </Campo>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full bg-muted p-1 text-[12px]">
          {(["texto", "html"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set("formato", f)}
              className={`rounded-full px-3 py-1 ${form.formato === f ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
            >
              {f === "texto" ? "Texto" : "HTML"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setIaAberta((v) => !v)}>
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Escrever com IA
        </Button>
      </div>

      {iaAberta && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <Textarea
            rows={4}
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            placeholder={
              form.corpo.trim()
                ? "O que mudar? Ex.: deixe mais curto e troque o botão para “Agendar conversa”"
                : "Sobre o que é o e-mail? Público, oferta, link do botão, tom…"
            }
            className="bg-background text-[13px]"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {form.corpo.trim()
                ? "A IA ajusta o e-mail atual."
                : "A IA escreve assunto, pré-cabeçalho e corpo."}
            </p>
            <Button
              size="sm"
              onClick={() => ia.mutate()}
              disabled={ia.isPending || briefing.trim().length < 5}
            >
              {ia.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              {form.corpo.trim() ? "Ajustar" : "Escrever"}
            </Button>
          </div>
        </div>
      )}

      <Textarea
        rows={18}
        value={form.corpo}
        onChange={(e) => set("corpo", e.target.value)}
        placeholder={
          form.formato === "texto"
            ? "# Título\n\nOi, {{primeiro_nome|tudo bem}}?\n\nTexto do e-mail…\n\n[[Quero saber mais|https://grougp.com.br]]"
            : "<h1>Título</h1>\n<p>Oi, {{primeiro_nome|tudo bem}}?</p>"
        }
        className="font-mono text-[12px] leading-relaxed"
      />
      {form.formato === "texto" ? (
        <div className="grid gap-x-4 gap-y-0.5 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
          <span>
            <code># Título</code> título
          </span>
          <span>
            <code>- item</code> lista
          </span>
          <span>
            <code>**texto**</code> negrito
          </span>
          <span>
            <code>[texto](https://…)</code> link
          </span>
          <span className="sm:col-span-2">
            <code>[[Texto do botão|https://link]]</code> botão (linha sozinha)
          </span>
          <span className="sm:col-span-2">
            <code>{"{{primeiro_nome|tudo bem}}"}</code> nome (ou o padrão) ·{" "}
            <code>{"{{empresa}}"}</code> · <code>{"{{email}}"}</code>
          </span>
          <span className="sm:col-span-2">Linha em branco separa parágrafos.</span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          HTML vai dentro do layout da Grou (cabeçalho e rodapé de descadastro são automáticos). As
          variáveis <code>{"{{primeiro_nome}}"}</code> e <code>{"{{empresa}}"}</code> também
          funcionam.
        </p>
      )}
      {desconhecidas.length > 0 && (
        <p className="text-[11px] text-amber-600">
          Variável desconhecida: {desconhecidas.map((v) => `{{${v}}}`).join(", ")} — vai sair vazia.
        </p>
      )}
    </>
  );
}

function Previa({
  form,
  titulo = "Prévia",
}: {
  form: Pick<
    Form,
    | "assunto"
    | "preheader"
    | "corpo"
    | "formato"
    | "remetente_nome"
    | "remetente_email"
    | "imagem_topo"
  >;
  titulo?: string;
}) {
  const r = useMemo(
    () =>
      renderEmail({
        assunto: form.assunto,
        preheader: form.preheader,
        corpo: form.corpo,
        formato: form.formato,
        contato: CONTATO_EXEMPLO,
        urlClique: null,
        urlAbertura: null,
        urlDescadastro: "#",
        imagemTopo: form.imagem_topo ?? null,
      }),
    [form.assunto, form.preheader, form.corpo, form.formato, form.imagem_topo],
  );
  return (
    <Card className="overflow-hidden">
      <div className="space-y-0.5 border-b px-3 py-2 text-[12px]">
        <p className="section-label">{titulo} · como Maria Silva, Empresa Exemplo</p>
        <p className="truncate text-muted-foreground">
          De: {form.remetente_nome} &lt;{form.remetente_email}&gt;
        </p>
        <p className="truncate font-semibold">{r.assunto || "(sem assunto)"}</p>
        {form.preheader && <p className="truncate text-muted-foreground">{form.preheader}</p>}
      </div>
      <iframe
        title="Prévia do e-mail"
        srcDoc={r.html}
        sandbox=""
        className="h-[520px] w-full border-0 bg-[#f3f5f9] lg:h-[calc(100vh-220px)]"
      />
    </Card>
  );
}

// ---------------------------------------------------------- acompanhamento
type Metricas = {
  enviados: number;
  pendentes: number;
  falhas: number;
  suprimidos: number;
  aberturas: number;
  cliques: number;
  descadastros: number;
};

function Painel({
  campanha: c,
  metricas: m,
  envios,
}: {
  campanha: CampanhaCompleta;
  metricas: Metricas;
  envios: EnvioDaCampanha[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const acaoFn = useServerFn(acaoCampanha);
  const duplicarFn = useServerFn(duplicarCampanha);
  const [filtro, setFiltro] = useState("");

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["email-mkt", "campanha", c.id] });
    qc.invalidateQueries({ queryKey: ["email-mkt", "campanhas"] });
  };
  const acao = useMutation({
    mutationFn: (a: "pausar" | "cancelar") => acaoFn({ data: { id: c.id, acao: a } }),
    onSuccess: (_r, a) => {
      toast.success(a === "pausar" ? "Envio pausado" : "Campanha cancelada");
      atualizar();
    },
    onError: erro,
  });
  const duplicar = useMutation({
    mutationFn: () => duplicarFn({ data: { id: c.id } }),
    onSuccess: (r) => {
      toast.success("Cópia criada");
      qc.invalidateQueries({ queryKey: ["email-mkt", "campanhas"] });
      navigate({ to: "/email-marketing/campanha/$id", params: { id: r.id } });
    },
    onError: erro,
  });

  const processados = m.enviados + m.falhas + m.suprimidos;
  const total = Math.max(c.destinatarios || 0, processados + m.pendentes);
  const progresso = total > 0 ? Math.min(100, Math.round((processados / total) * 100)) : 0;
  const lista = useMemo(() => {
    const b = filtro.trim().toLowerCase();
    if (!b) return envios;
    return envios.filter((e) =>
      [e.email, e.nome ?? "", e.empresa ?? ""].some((v) => v.toLowerCase().includes(b)),
    );
  }, [envios, filtro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {c.status === "enviando" && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={acao.isPending}
              onClick={() => acao.mutate("pausar")}
            >
              <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={acao.isPending}
              onClick={() => {
                if (window.confirm("Cancelar o envio? Os e-mails na fila não saem."))
                  acao.mutate("cancelar");
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={duplicar.isPending}
          onClick={() => duplicar.mutate()}
        >
          <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
        </Button>
        <span className="text-[12px] text-muted-foreground">
          Início {dataHora(c.iniciada_em)}
          {c.concluida_em ? ` · fim ${dataHora(c.concluida_em)}` : ""}
          {c.status === "enviando" ? " · atualiza a cada 30 s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Metrica rotulo="Destinatários" valor={c.destinatarios} />
        <Metrica rotulo="Enviados" valor={m.enviados} />
        <Metrica rotulo="Na fila" valor={m.pendentes} />
        <Metrica rotulo="Aberturas" valor={m.aberturas} extra={pct(m.aberturas, m.enviados)} />
        <Metrica rotulo="Cliques" valor={m.cliques} extra={pct(m.cliques, m.enviados)} />
        <Metrica
          rotulo="Descadastros"
          valor={m.descadastros}
          extra={pct(m.descadastros, m.enviados)}
        />
        <Metrica rotulo="Falhas" valor={m.falhas} />
        <Metrica rotulo="Suprimidos" valor={m.suprimidos} />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
          <span>
            {processados.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} processados
          </span>
          <span>{progresso}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progresso}%` }}
          />
        </div>
        {m.pendentes > 0 && c.status === "enviando" && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            A fila respeita o limite diário; o que sobrar sai nos próximos dias.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <p className="section-label">Últimos envios ({envios.length})</p>
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar"
              className="h-8 w-40 text-[12px]"
            />
          </div>
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Contato</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Enviado</th>
                  <th className="px-3 py-2">Abriu</th>
                  <th className="px-3 py-2">Clicou</th>
                  <th className="px-3 py-2">Descad.</th>
                </tr>
              </thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhum envio.
                    </td>
                  </tr>
                ) : (
                  lista.map((e, i) => (
                    <tr key={`${e.email}-${i}`} className="border-b last:border-0 align-top">
                      <td className="px-3 py-1.5">
                        {e.lead_id ? (
                          <Link
                            to="/lead/$id"
                            params={{ id: e.lead_id }}
                            className="font-medium hover:underline"
                          >
                            {e.nome || e.email}
                          </Link>
                        ) : (
                          <span className="font-medium">{e.nome || e.email}</span>
                        )}
                        <span className="block text-[11px] text-muted-foreground">
                          {e.email}
                          {e.empresa ? ` · ${e.empresa}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={
                            e.status === "falhou"
                              ? "text-destructive"
                              : e.status === "suprimido"
                                ? "text-muted-foreground"
                                : ""
                          }
                          title={e.erro ?? undefined}
                        >
                          {STATUS_ENVIO[e.status] ?? e.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {e.enviado_em ? dataHora(e.enviado_em) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {e.aberto_em ? dataHora(e.aberto_em) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {e.clicado_em ? dataHora(e.clicado_em) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {e.descadastrou_em ? dataHora(e.descadastrou_em) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="min-w-0">
          <Previa form={formDe(c)} titulo="E-mail enviado" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ peças
function Secao({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
          {n}
        </span>
        {titulo}
      </h3>
      {children}
    </Card>
  );
}

function Campo({
  rotulo,
  erro: msg,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-muted-foreground">{rotulo}</span>
      {children}
      {msg && <span className="block text-[11px] text-destructive">{msg}</span>}
    </label>
  );
}

function Item({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "•"}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

function Metrica({ rotulo, valor, extra }: { rotulo: string; valor: number; extra?: string }) {
  return (
    <div className="surface-panel p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</p>
      {extra && <p className="text-[11px] text-muted-foreground">{extra}</p>}
    </div>
  );
}
