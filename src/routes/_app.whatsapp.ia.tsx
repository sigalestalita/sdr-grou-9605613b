import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAiAgentSettings,
  triggerManualAiTest,
  updateAiAgentSettings,
} from "@/lib/whatsapp-ai.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { listAccounts } from "@/lib/whatsapp-accounts.functions";
import { getCampaignFilterMeta } from "@/lib/whatsapp-campaigns.functions";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, Save } from "lucide-react";
import { pareceConterPreco } from "@/lib/whatsapp/ofertas";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/whatsapp/ia")({
  component: WhatsAppAiPage,
});

function WhatsAppAiPage() {
  const navigate = useNavigate();
  const getFn = useServerFn(getAiAgentSettings);
  const saveFn = useServerFn(updateAiAgentSettings);
  const testFn = useServerFn(triggerManualAiTest);
  const templatesFn = useServerFn(listTemplates);
  const accountsFn = useServerFn(listAccounts);
  const metaFn = useServerFn(getCampaignFilterMeta);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["wa-ai-settings"], queryFn: () => getFn() });
  const { data: tmpls } = useQuery({
    queryKey: ["wa-templates-mini"],
    queryFn: () => templatesFn(),
  });
  const { data: accs } = useQuery({ queryKey: ["wa-accounts-mini"], queryFn: () => accountsFn() });
  const { data: meta } = useQuery({ queryKey: ["wa-camp-meta"], queryFn: () => metaFn() });

  const settings = data?.settings;
  const [dirty, setDirty] = useState(false);
  type Form = NonNullable<typeof settings>;
  const [form, setForm] = useState<Form | null>(null);
  const [testPhone, setTestPhone] = useState("51999969371");
  const [testName, setTestName] = useState("Teste IA WhatsApp");

  useEffect(() => {
    if (settings && !dirty) setForm(settings);
  }, [settings, dirty]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["wa-ai-settings"] });
    },
  });

  const triggerTest = useMutation({
    mutationFn: () => testFn({ data: { phone: testPhone, name: testName } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Teste da IA disparado para o número informado.");
      if (result.conversationId) {
        navigate({ to: "/whatsapp", search: { c: result.conversationId } as never });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao disparar teste da IA"),
  });

  if (isLoading || !form)
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const stages = meta?.stages ?? [];
  const templates = (tmpls?.templates ?? []).filter((t) => !!t.provider_template_name);

  /*
   * O template escolhido pode não conseguir disparar.
   *
   * Fora da janela de 24h a Meta só entrega template APROVADO — um rascunho
   * selecionado aqui faz o primeiro contato falhar em silêncio, e de fora
   * parece que a automação não rodou. Template de campanha vencido tem o mesmo
   * efeito, porque o disparo passa a ser recusado por data.
   */
  const porId = new Map(templates.map((t) => [t.id as string, t]));
  function avisoDoTemplate(id: string | null | undefined): string | null {
    if (!id) return null;
    const t = porId.get(id) as
      | { name?: string; status?: string; valido_ate?: string | null }
      | undefined;
    if (!t) return "O template escolhido não existe mais.";
    if (t.status !== "approved") {
      return `"${t.name}" está como ${t.status ?? "rascunho"} — a Meta só entrega template aprovado, então o primeiro contato não vai sair. Envie para aprovação em Templates.`;
    }
    const validade = t.valido_ate ?? null;
    if (validade) {
      const fim = new Date(`${validade}T23:59:59`).getTime();
      if (Number.isFinite(fim) && fim < Date.now()) {
        return `"${t.name}" é de campanha e venceu em ${validade}. O disparo é recusado; escolha um template sem campanha.`;
      }
    }
    return null;
  }
  const accounts = (accs?.accounts ?? []) as Array<{
    id: string;
    label: string | null;
    phone_number: string;
  }>;
  const missingPrerequisites = [
    !form.enabled ? "Ative a IA de atendimento" : null,
    !form.initialOutreachEnabled ? "Ative o disparo inicial proativo" : null,
    !form.initialTemplateId ? "Selecione um template HSM inicial" : null,
  ].filter(Boolean) as string[];
  const canTriggerTest =
    !dirty && !triggerTest.isPending && !!testPhone.trim() && missingPrerequisites.length === 0;

  const patch = (next: Record<string, unknown>) => {
    setForm((prev) => (prev ? { ...prev, ...next } : prev));
    setDirty(true);
  };

  const handleTriggerTest = async () => {
    if (dirty) {
      toast.error("Salve as alterações da IA antes de disparar o teste manual.");
      return;
    }
    if (missingPrerequisites.length > 0) {
      toast.error(`Antes do teste: ${missingPrerequisites.join(" · ")}.`);
      return;
    }
    triggerTest.mutate();
  };

  const toggleStage = (id: string) => {
    const current = new Set(form.handoffStageIds ?? []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    patch({ handoffStageIds: Array.from(current) });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> IA de atendimento
          </h2>
          <p className="text-xs text-muted-foreground">
            Controla a IA proativa que faz o primeiro atendimento, inicia com HSM e qualifica até o
            ponto de handoff comercial.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
          <Save className="h-4 w-4 mr-1.5" /> {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ativação</CardTitle>
          <CardDescription>
            Defina quando a IA fica autorizada a iniciar e manter conversas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">IA habilitada</p>
                <p className="text-xs text-muted-foreground">
                  Liga o motor de atendimento inteligente.
                </p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">Responder automaticamente</p>
                <p className="text-xs text-muted-foreground">
                  Quando o lead responde no WhatsApp, a IA continua a qualificação e respeita pedido
                  de atendimento humano.
                </p>
              </div>
              <Switch
                checked={form.autoReplyEnabled}
                onCheckedChange={(v) => patch({ autoReplyEnabled: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">Disparo inicial proativo</p>
                <p className="text-xs text-muted-foreground">
                  Todo lead novo recebe primeiro contato por template HSM no número conectado.
                </p>
              </div>
              <Switch
                checked={form.initialOutreachEnabled}
                onCheckedChange={(v) => patch({ initialOutreachEnabled: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">Parar após resposta do lead</p>
                <p className="text-xs text-muted-foreground">
                  Evita looping se o time quiser assumir manualmente logo após a primeira resposta
                  do lead.
                </p>
              </div>
              <Switch
                checked={form.stopOnLeadReply}
                onCheckedChange={(v) => patch({ stopOnLeadReply: v })}
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Template HSM inicial</label>
              <Select
                value={form.initialTemplateId ?? "none"}
                onValueChange={(v) => patch({ initialTemplateId: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.status === "approved" ? "" : ` · ${t.status ?? "rascunho"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {avisoDoTemplate(form.initialTemplateId) ? (
                <p className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                  {avisoDoTemplate(form.initialTemplateId)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Use um template aprovado na Meta para iniciar a conversa fora da janela de 24h.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Sugestão: o texto do template já pode abrir espaço para o lead pedir atendimento
                humano desde o início.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Máximo de respostas automáticas por conversa
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.responseMaxPerConversation}
                onChange={(e) => patch({ responseMaxPerConversation: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ofertas que a IA pode citar</CardTitle>
          <CardDescription>
            A IA só fala de valor que estiver nesta lista e dentro do prazo. Sem oferta vigente, ela
            é instruída a não citar preço nenhum e a conduzir para a pessoa responsável.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(form.ofertas ?? []).length === 0 && (
            <p className="text-[12px] text-muted-foreground">
              Nenhuma oferta cadastrada. A IA não vai citar valores.
            </p>
          )}
          {(form.ofertas ?? []).map((o, i) => {
            const vencida = !!o.validoAte && new Date(`${o.validoAte}T23:59:59`) < new Date();
            return (
              <div
                key={i}
                className={`space-y-2 rounded-md border p-3 ${vencida ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={o.titulo}
                    placeholder="Licença Bronze com 5 créditos"
                    onChange={(e) => {
                      const next = [...(form.ofertas ?? [])];
                      next[i] = { ...o, titulo: e.target.value };
                      patch({ ofertas: next });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() =>
                      patch({ ofertas: (form.ofertas ?? []).filter((_, j) => j !== i) })
                    }
                  >
                    Remover
                  </Button>
                </div>
                <Textarea
                  value={o.detalhe}
                  rows={2}
                  placeholder="Condição exatamente como a IA pode dizer"
                  onChange={(e) => {
                    const next = [...(form.ofertas ?? [])];
                    next[i] = { ...o, detalhe: e.target.value };
                    patch({ ofertas: next });
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-muted-foreground">Válida até</label>
                  <Input
                    type="date"
                    className="w-44"
                    value={o.validoAte ?? ""}
                    onChange={(e) => {
                      const next = [...(form.ofertas ?? [])];
                      next[i] = { ...o, validoAte: e.target.value || null };
                      patch({ ofertas: next });
                    }}
                  />
                  {vencida && (
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      Vencida — a IA já parou de citar
                    </span>
                  )}
                  {!o.validoAte && (
                    <span className="text-[11px] text-muted-foreground">
                      Sem prazo: vale até alguém remover
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                ofertas: [...(form.ofertas ?? []), { titulo: "", detalhe: "", validoAte: null }],
              })
            }
          >
            Adicionar oferta
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quem a IA atende, e com que nome</CardTitle>
          <CardDescription>
            A IA se apresenta com o nome do SDR responsável pelo lead. Empresa só é atendida abaixo
            do porte definido; consultoria é atendida integralmente e o bastão vai para quem cuida
            dessa carteira.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">
                Nome usado quando o lead não tem responsável
              </label>
              <Input
                value={form.assinaturaFallback}
                onChange={(e) => patch({ assinaturaFallback: e.target.value })}
                placeholder="Equipe Grou"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Com responsável definido, a IA assina com o primeiro nome dele.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Esperar antes de responder (segundos)
              </label>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.respostaDelaySegundos ?? 30}
                onChange={(e) => patch({ respostaDelaySegundos: Number(e.target.value) || 0 })}
                placeholder="30"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Contado desde a mensagem do lead. Gerar a resposta já leva alguns segundos e a
                espera só completa o que falta. Zero responde na hora.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                A IA atende empresa com menos de
              </label>
              <Input
                type="number"
                min={0}
                max={100000}
                value={form.empresaMaxFuncionarios}
                onChange={(e) => patch({ empresaMaxFuncionarios: Number(e.target.value) })}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Funcionários. Acima disso a conversa vai direto para o responsável, sem a IA
                responder.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="pr-4">
              <p className="text-sm font-medium">Atender 100% das consultorias</p>
              <p className="text-[11px] text-muted-foreground">
                Consultoria é atendida sem corte de porte.
              </p>
            </div>
            <Switch
              checked={form.consultoriaAtendeTudo}
              onCheckedChange={(v) => patch({ consultoriaAtendeTudo: v })}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Bastão de consultoria vai para</label>
            <Select
              value={form.consultoriaHandoffUserId ?? ""}
              onValueChange={(v) => patch({ consultoriaHandoffUserId: v || null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha a responsável por consultoria" />
              </SelectTrigger>
              <SelectContent>
                {(data?.profiles ?? []).map(
                  (p: { id: string; full_name: string | null; email: string | null }) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Vale quando houver intenção de agenda comercial ou pedido de atendimento humano.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roteamento por conta de WhatsApp</CardTitle>
          <CardDescription>
            Escolha qual conta a IA usa por padrão e qual conta específica atende leads de{" "}
            <strong>Consultoria</strong> (com template HSM próprio, se quiser).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">
                Conta padrão (Empresa / Pessoa física)
              </label>
              <Select
                value={form.defaultAccountId ?? "__auto"}
                onValueChange={(v) => patch({ defaultAccountId: v === "__auto" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">Conta marcada como padrão</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label || a.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Conta para Consultoria</label>
              <Select
                value={form.consultoriaAccountId ?? "__none"}
                onValueChange={(v) => patch({ consultoriaAccountId: v === "__none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Usar a padrão</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label || a.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Template HSM inicial para Consultoria (opcional)
            </label>
            <Select
              value={form.consultoriaInitialTemplateId ?? "__none"}
              onValueChange={(v) =>
                patch({ consultoriaInitialTemplateId: v === "__none" ? null : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Usar o template inicial padrão</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.status === "approved" ? "" : ` · ${t.status ?? "rascunho"}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {avisoDoTemplate(form.consultoriaInitialTemplateId) ? (
              <p className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                {avisoDoTemplate(form.consultoriaInitialTemplateId)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Recomendado quando a mensagem inicial de consultoria for diferente da comercial.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teste manual</CardTitle>
          <CardDescription>
            Dispara o template inicial da IA para validar o fluxo ponta a ponta no seu número.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dirty ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Existem alterações não salvas. Salve antes de disparar o teste manual.
            </div>
          ) : null}
          {missingPrerequisites.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Pré-requisitos pendentes: {missingPrerequisites.join(" · ")}.
            </div>
          ) : null}
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Telefone</label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="51999969371"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nome do lead de teste</label>
              <Input
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Teste IA WhatsApp"
              />
            </div>
            <Button onClick={handleTriggerTest} disabled={!canTriggerTest}>
              {triggerTest.isPending ? "Disparando…" : "Disparar teste"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt operacional</CardTitle>
          <CardDescription>
            O que a IA deve saber, como deve agir e quando precisa passar para humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Objetivo de qualificação</label>
            <Textarea
              value={form.qualificationObjective}
              onChange={(e) => patch({ qualificationObjective: e.target.value })}
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Guia de tom</label>
            <Textarea
              value={form.toneGuide}
              onChange={(e) => patch({ toneGuide: e.target.value })}
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Regras / claims proibidos</label>
            <Textarea
              value={form.prohibitedClaims}
              onChange={(e) => patch({ prohibitedClaims: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Prompt da primeira mensagem</label>
              <Textarea
                value={form.firstMessagePrompt}
                onChange={(e) => patch({ firstMessagePrompt: e.target.value })}
                rows={5}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prompt de resposta contínua</label>
              <Textarea
                value={form.replyPrompt}
                onChange={(e) => patch({ replyPrompt: e.target.value })}
                rows={5}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Regras de handoff humano</label>
            <Textarea
              value={form.handoffPrompt}
              onChange={(e) => patch({ handoffPrompt: e.target.value })}
              rows={4}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Base de conhecimento adicional</label>
            <Textarea
              value={form.knowledgeBase}
              onChange={(e) => patch({ knowledgeBase: e.target.value })}
              rows={10}
              placeholder="Diferenciais, objeções, segmentos, FAQ, criativos, contexto das campanhas..."
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Contexto de campanhas, criativos, formulários e objeções por segmento. Não escreva
              preço aqui: valor vive no bloco de ofertas, que tem prazo de validade.
            </p>
            {pareceConterPreco(form.knowledgeBase) && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Parece haver valor ou promoção escrita aqui. Texto solto não vence sozinho, e foi
                  assim que uma campanha encerrada continuou sendo oferecida. Mova para o bloco de
                  ofertas, com data de fim.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas de handoff</CardTitle>
          <CardDescription>
            Quando o lead chegar em uma dessas etapas, a IA para de responder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {stages.map((stage) => (
              <Badge
                key={stage.id}
                variant={(form.handoffStageIds ?? []).includes(stage.id) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleStage(stage.id)}
              >
                {stage.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
