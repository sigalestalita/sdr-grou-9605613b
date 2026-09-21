import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMessages,
  sendMessage,
  sendMediaFromStorage,
  sendTemplateToConversation,
  ocultarMensagemNoCrm,
} from "@/lib/whatsapp.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { explainWhatsappError } from "@/lib/whatsapp/send-error";
import {
  summarizeConversation,
  suggestReply,
  classifyTemperature,
  getConversationAi,
  suggestApproachPlan,
} from "@/lib/whatsapp-ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useOwnerLabel } from "@/lib/use-owner-label";
import {
  Send,
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  Sparkles,
  FileText,
  Thermometer,
  Loader2,
  Paperclip,
  Target,
  EyeOff,
} from "lucide-react";

type Msg = {
  id: string;
  body: string | null;
  sender_type: string;
  message_type: string;
  media_mime?: string | null;
  status: string;
  /** Motivo da falha, como o WhatsApp devolveu (só quando status = failed). */
  error?: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  media_url: string | null;
  metadata?: {
    source?: string | null;
    template_name?: string | null;
    rendered_body?: string | null;
  } | null;
};

export function ConversationView({ conversationId }: { conversationId: string }) {
  const listFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const sendMediaFn = useServerFn(sendMediaFromStorage);
  const aiGet = useServerFn(getConversationAi);
  const aiSummarize = useServerFn(summarizeConversation);
  const aiSuggest = useServerFn(suggestReply);
  const aiClassify = useServerFn(classifyTemperature);
  const aiPlan = useServerFn(suggestApproachPlan);
  const qc = useQueryClient();
  const ocultarFn = useServerFn(ocultarMensagemNoCrm);
  /*
   * Esconder é da vista daqui, não do WhatsApp: a API da Meta não apaga
   * mensagem entregue. Some do histórico para a conversa não confundir quem
   * for atender, e o registro continua no banco.
   */
  const ocultar = useMutation({
    mutationFn: (messageId: string) => ocultarFn({ data: { messageId, oculta: true } }),
    onSuccess: () => {
      toast.success("Mensagem escondida do histórico. Ela continua no celular do lead.");
      qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para esconder"),
  });
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-messages", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
  });

  const { data: ai } = useQuery({
    queryKey: ["wa-ai", conversationId],
    queryFn: () => aiGet({ data: { conversationId } }),
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`wa-conv-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["wa-conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { conversationId, body, messageType: "text" } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  const summarize = useMutation({
    mutationFn: () => aiSummarize({ data: { conversationId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-ai", conversationId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao resumir"),
  });

  const classify = useMutation({
    mutationFn: () => aiClassify({ data: { conversationId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["wa-ai", conversationId] });
      toast.success(`Temperatura: ${r.temperature}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao classificar"),
  });

  const suggest = useMutation({
    mutationFn: () => aiSuggest({ data: { conversationId } }),
    onSuccess: (r) => {
      setText(r.reply);
      toast.success("Sugestão pronta no campo de mensagem.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao sugerir"),
  });

  const plan = useMutation({
    mutationFn: () => aiPlan({ data: { conversationId } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar plano"),
  });

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo maior que 16MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `conversations/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      const { error: upErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      await sendMediaFn({
        data: {
          conversationId,
          storagePath: path,
          mime: file.type || "application/octet-stream",
          caption: text.trim() || undefined,
        },
      });
      setText("");
      qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      toast.success("Anexo enviado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar anexo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Enquanto carrega, não trava o campo — só bloqueia quando o servidor
  // confirma que a janela de 24h está fechada.
  const canSendFreeText = data?.window ? data.window.canSendFreeText : true;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v || !canSendFreeText) return;
    send.mutate(v);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AiToolbar
        ai={ai ?? null}
        summarizing={summarize.isPending}
        classifying={classify.isPending}
        planning={plan.isPending}
        plan={plan.data ?? null}
        onSummarize={() => summarize.mutate()}
        onClassify={() => classify.mutate()}
        onPlan={() => plan.mutate()}
        onUsePlanMessage={(m) => setText(m)}
      />
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-muted/20"
      >
        {isLoading && <p className="text-xs text-muted-foreground text-center">Carregando…</p>}
        {data?.messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhuma mensagem ainda. Envie a primeira para iniciar a conversa.
          </p>
        )}
        {data?.messages.map((m, i) => {
          const msg = m as Msg;
          const prev = i > 0 ? (data.messages[i - 1] as Msg) : null;
          return (
            <Fragment key={msg.id}>
              {(!prev || !sameDay(prev.created_at, msg.created_at)) && (
                <DaySeparator iso={msg.created_at} />
              )}
              <MessageBubble
                m={msg}
                leadName={data.lead?.name ?? null}
                onOcultar={() => ocultar.mutate(msg.id)}
              />
            </Fragment>
          );
        })}
      </div>
      <WindowBar
        window={data?.window ?? null}
        conversationId={conversationId}
        onSent={() => {
          qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["wa-conversations"] });
        }}
      />
      <form onSubmit={onSubmit} className="border-t border-white/5 p-3 flex gap-2 items-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Sugerir resposta com IA"
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending || send.isPending}
        >
          {suggest.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Anexar arquivo (imagem, vídeo, áudio, documento)"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || send.isPending}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          placeholder={
            canSendFreeText
              ? "Digite uma mensagem ou anexe um arquivo (Enter envia, Shift+Enter quebra linha)"
              : "Janela de 24h fechada — envie um template aprovado pelo botão acima"
          }
          className="min-h-[44px] max-h-[160px] resize-none"
          disabled={send.isPending || uploading || !canSendFreeText}
        />
        <Button
          type="submit"
          disabled={send.isPending || uploading || !text.trim() || !canSendFreeText}
          size="sm"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

type Win = {
  state: "aberta" | "fechando" | "fechada" | "sem_contato";
  canSendFreeText: boolean;
  label: string;
  hint: string;
};

const WIN_TONE: Record<Win["state"], string> = {
  aberta: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  fechando: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  fechada: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  sem_contato: "border-border bg-muted/40 text-muted-foreground",
};

/**
 * Estado da janela de 24h do WhatsApp, logo acima do campo de mensagem, com o
 * atalho para mandar um template aprovado quando ela está fechada.
 */
function WindowBar({
  window: win,
  conversationId,
  onSent,
}: {
  window: Win | null;
  conversationId: string;
  onSent: () => void;
}) {
  const listFn = useServerFn(listTemplates);
  const sendTemplateFn = useServerFn(sendTemplateToConversation);
  const [open, setOpen] = useState(false);

  const { data: tpl } = useQuery({
    queryKey: ["wa-templates-approved"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });
  const approved = (tpl?.templates ?? []).filter(
    (t: { status?: string | null }) => t.status === "approved",
  ) as Array<{ id: string; name: string; body: string | null; category: string | null }>;

  const sendTemplate = useMutation({
    mutationFn: (templateId: string) => sendTemplateFn({ data: { conversationId, templateId } }),
    onSuccess: () => {
      toast.success("Template enviado");
      setOpen(false);
      onSent();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar template"),
  });

  if (!win) return null;
  const urgent = win.state === "fechada" || win.state === "sem_contato";

  return (
    <div
      className={`flex items-center gap-2 border-t px-3 py-2 text-[11px] ${WIN_TONE[win.state]}`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">{win.label}</span>
      <span className="hidden min-w-0 flex-1 truncate opacity-80 sm:block">{win.hint}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={urgent ? "default" : "outline"}
            className="ml-auto h-7 shrink-0 text-[11px]"
          >
            <FileText className="mr-1 h-3.5 w-3.5" />
            Enviar template
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="border-b px-3 py-2">
            <p className="text-xs font-semibold">Templates aprovados na Meta</p>
            <p className="text-[11px] text-muted-foreground">
              São os únicos que saem com a janela fechada. As variáveis são preenchidas com os dados
              do lead.
            </p>
          </div>
          {approved.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-muted-foreground">
              Nenhum template aprovado ainda. Crie e envie para aprovação na aba Templates.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {approved.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={sendTemplate.isPending}
                    onClick={() => sendTemplate.mutate(t.id)}
                    className="w-full px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      {t.name}
                      {t.category && (
                        <Badge variant="outline" className="text-[9px]">
                          {t.category}
                        </Badge>
                      )}
                    </p>
                    {t.body && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {t.body}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function sameDay(a: string, b: string) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** "Hoje", "Ontem" ou "quarta-feira, 10/09/2026". */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const dias = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Marca a virada de dia na conversa, como no WhatsApp. */
function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground ring-1 ring-border">
        {dayLabel(iso)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function MessageBubble({
  m,
  leadName,
  onOcultar,
}: {
  m: Msg;
  leadName?: string | null;
  onOcultar?: () => void;
}) {
  const mine =
    m.sender_type === "sdr" ||
    m.sender_type === "bot" ||
    m.sender_type === "automation" ||
    m.sender_type === "agent";
  const templateFallback =
    m.message_type === "template"
      ? (m.body ??
        m.metadata?.rendered_body ??
        (m.metadata?.template_name ? `[HSM] ${m.metadata.template_name}` : null))
      : null;
  const displayBody = templateFallback ?? m.body;
  const isAudio = m.message_type === "audio" || m.media_mime?.startsWith("audio/");
  const senderLabel =
    m.sender_type === "bot"
      ? "IA"
      : m.sender_type === "automation"
        ? "Automação"
        : m.sender_type === "sdr" || m.sender_type === "agent"
          ? "Time"
          : leadName?.trim() || "Lead";
  // Só o que saiu daqui pode ser escondido: a fala do lead é o contexto.
  const podeEsconder = !!onOcultar && m.sender_type !== "lead";
  return (
    <div className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {podeEsconder && mine && (
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Esconder esta mensagem do histórico do CRM?\n\nEla continua no celular do lead — o WhatsApp não permite apagar mensagem já entregue.",
              )
            )
              onOcultar?.();
          }}
          title="Esconder do histórico do CRM"
          className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-white/5 rounded-bl-sm"
        }`}
      >
        <div
          className={`mb-1 text-[10px] uppercase tracking-wide ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
        >
          {senderLabel}
        </div>
        {m.media_url ? (
          isAudio ? (
            <audio controls preload="metadata" className="mb-2 h-10 w-full max-w-[280px]">
              <source src={m.media_url} type={m.media_mime ?? undefined} />
              Seu navegador não suporta reprodução de áudio.
            </audio>
          ) : (
            <a
              href={m.media_url}
              target="_blank"
              rel="noreferrer"
              className="block mb-1 underline text-xs opacity-80"
            >
              Anexo
            </a>
          )
        ) : isAudio ? (
          <div
            className={`mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${mine ? "border-primary-foreground/20 text-primary-foreground/80" : "border-white/10 text-muted-foreground"}`}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Áudio recebido sem arquivo disponível</span>
          </div>
        ) : null}
        {displayBody && <p className="whitespace-pre-wrap break-words">{displayBody}</p>}
        <div
          className={`flex items-center gap-1 mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
        >
          <span title={new Date(m.created_at).toLocaleString("pt-BR")}>
            {new Date(m.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {mine && <StatusIcon status={m.status} />}
        </div>
        {mine && m.status === "failed" && <FailureNote error={m.error} />}
      </div>
    </div>
  );
}

/** Por que a mensagem não chegou — em português, com o que fazer. */
function FailureNote({ error }: { error?: string | null }) {
  const f = explainWhatsappError(error);
  return (
    <div className="mt-1.5 rounded-lg bg-red-950/30 px-2 py-1.5 text-[11px] leading-snug text-red-50 ring-1 ring-red-300/40">
      <p className="flex items-center gap-1 font-semibold">
        <AlertCircle className="h-3 w-3 shrink-0" />
        Não entregue · {f.title}
        {f.scope === "conta" && (
          <span className="rounded-full bg-red-100/20 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide">
            afeta a conta toda
          </span>
        )}
      </p>
      <p className="mt-0.5 opacity-90">{f.action}</p>
      {error && (
        <p className="mt-0.5 truncate font-mono text-[10px] opacity-60" title={error}>
          {f.code ? `#${f.code} · ` : ""}
          {error}
        </p>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "sending") return <Clock className="h-3 w-3" />;
  if (status === "sent") return <Check className="h-3 w-3" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-300" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-red-300" />;
  return null;
}

type AiState = {
  ai_summary: string | null;
  ai_summary_at: string | null;
  temperature: string | null;
  temperature_reason: string | null;
  temperature_at: string | null;
} | null;

function AiToolbar({
  ai,
  summarizing,
  classifying,
  planning,
  plan,
  onSummarize,
  onClassify,
  onPlan,
  onUsePlanMessage,
}: {
  ai: AiState;
  summarizing: boolean;
  classifying: boolean;
  planning: boolean;
  plan: {
    diagnosis: string;
    options: Array<{
      strategy: string;
      rationale: string;
      message: string;
      expected_conversion: "alta" | "média" | "baixa";
    }>;
  } | null;
  onSummarize: () => void;
  onClassify: () => void;
  onPlan: () => void;
  onUsePlanMessage: (m: string) => void;
}) {
  const ownerLabel = useOwnerLabel();
  const tempColor =
    ai?.temperature === "quente"
      ? "border-red-500/40 text-red-300 bg-red-500/10"
      : ai?.temperature === "morno"
        ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
        : ai?.temperature === "frio"
          ? "border-sky-500/40 text-sky-300 bg-sky-500/10"
          : "border-white/10 text-muted-foreground";
  return (
    <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 bg-background/40">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 shrink-0">
        <Sparkles className="h-3 w-3" /> IA
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <FileText className="h-3.5 w-3.5" /> Resumo
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Resumo da conversa</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={onSummarize}
                disabled={summarizing}
              >
                {summarizing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : ai?.ai_summary ? (
                  "Atualizar"
                ) : (
                  "Gerar"
                )}
              </Button>
            </div>
            {ai?.ai_summary ? (
              <>
                <p className="text-xs whitespace-pre-wrap text-foreground">{ai.ai_summary}</p>
                {ai.ai_summary_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Gerado em {new Date(ai.ai_summary_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Sem resumo ainda. Clique em <strong>Gerar</strong>.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={`h-7 text-xs gap-1 ${tempColor}`}>
            <Thermometer className="h-3.5 w-3.5" />
            {ai?.temperature ?? "Classificar"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Temperatura do lead</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={onClassify}
                disabled={classifying}
              >
                {classifying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : ai?.temperature ? (
                  "Reclassificar"
                ) : (
                  "Classificar"
                )}
              </Button>
            </div>
            {ai?.temperature ? (
              <>
                <Badge variant="outline" className={`text-[10px] ${tempColor}`}>
                  {ai.temperature}
                </Badge>
                {ai.temperature_reason && (
                  <p className="text-xs text-muted-foreground">{ai.temperature_reason}</p>
                )}
                {ai.temperature_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Avaliado em {new Date(ai.temperature_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                A IA vai analisar a conversa e indicar se o lead está quente, morno ou frio.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Target className="h-3.5 w-3.5" /> Plano
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px]" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Plano de abordagem ({ownerLabel} sênior)</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={onPlan}
                disabled={planning}
              >
                {planning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : plan ? (
                  "Atualizar"
                ) : (
                  "Gerar"
                )}
              </Button>
            </div>
            {!plan && (
              <p className="text-[11px] text-muted-foreground">
                Gera 3 próximos passos com táticas distintas, ordenados por probabilidade de
                conversão.
              </p>
            )}
            {plan && (
              <>
                <p className="text-[11px] text-muted-foreground italic">{plan.diagnosis}</p>
                <div className="space-y-2">
                  {plan.options.map((opt, i) => (
                    <div key={i} className="rounded-md border border-white/10 p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">
                          {i + 1}. {opt.strategy}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {opt.expected_conversion}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{opt.rationale}</p>
                      <p className="text-xs whitespace-pre-wrap bg-muted/30 rounded p-1.5">
                        {opt.message}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] w-full"
                        onClick={() => onUsePlanMessage(opt.message)}
                      >
                        Usar esta mensagem
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
