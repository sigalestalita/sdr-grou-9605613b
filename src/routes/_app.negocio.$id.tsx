import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  StickyNote,
  Users,
  XCircle,
} from "lucide-react";
import {
  fecharNegocio,
  getNegocio,
  moverEtapa,
  registrarAtividade,
  salvarNegocio,
  TIPOS_ATIVIDADE,
} from "@/lib/comercial-negocio.functions";
import { moeda } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/negocio/$id")({
  component: NegocioPage,
  head: () => ({ meta: [{ title: "Negócio | Grou Compass" }] }),
});

const ICONE: Record<string, typeof Phone> = {
  ligacao: Phone,
  email: Mail,
  reuniao: Users,
  whatsapp: MessageCircle,
  proposta: FileText,
  nota: StickyNote,
  etapa: CheckCircle2,
};

const TEMPERATURAS = [
  { v: "quente", l: "Quente" },
  { v: "morno", l: "Morno" },
  { v: "frio", l: "Frio" },
] as const;

/** Para o input datetime-local, que não aceita ISO com fuso. */
function paraLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Ficha do negócio: é aqui que o executivo trabalha. Registra o que fez,
 * combina o próximo passo, move de etapa e fecha. Cada registro também vira o
 * histórico de follow-up que a gestão acompanha.
 */
function NegocioPage() {
  const { id } = useParams({ from: "/_app/negocio/$id" });
  const qc = useQueryClient();
  const fn = useServerFn(getNegocio);
  const atividadeFn = useServerFn(registrarAtividade);
  const moverFn = useServerFn(moverEtapa);
  const salvarFn = useServerFn(salvarNegocio);
  const fecharFn = useServerFn(fecharNegocio);

  const { data, isLoading, error } = useQuery({
    queryKey: ["negocio", id],
    queryFn: () => fn({ data: { id } }),
  });

  const [tipo, setTipo] = useState<(typeof TIPOS_ATIVIDADE)[number]["valor"]>("ligacao");
  const [descricao, setDescricao] = useState("");
  const [proximoPasso, setProximoPasso] = useState("");
  const [proximoEm, setProximoEm] = useState("");
  const [fechando, setFechando] = useState<null | "ganho" | "perdido">(null);

  const recarrega = () => {
    qc.invalidateQueries({ queryKey: ["negocio", id] });
    qc.invalidateQueries({ queryKey: ["comercial"] });
    qc.invalidateQueries({ queryKey: ["comercial-pipeline"] });
    qc.invalidateQueries({ queryKey: ["comercial-fila"] });
  };

  const registrar = useMutation({
    mutationFn: () =>
      atividadeFn({
        data: {
          dealId: id,
          tipo,
          descricao: descricao.trim() || undefined,
          ...(proximoPasso.trim() || proximoEm
            ? {
                proximoPasso: proximoPasso.trim() || null,
                proximoPassoEm: proximoEm ? new Date(proximoEm).toISOString() : null,
              }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Registrado");
      setDescricao("");
      setProximoPasso("");
      setProximoEm("");
      recarrega();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const mover = useMutation({
    mutationFn: (stageId: string) => moverFn({ data: { dealId: id, stageId } }),
    onSuccess: () => {
      toast.success("Etapa atualizada");
      recarrega();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const salvarCampo = useMutation({
    mutationFn: (campos: Record<string, unknown>) => salvarFn({ data: { id, ...campos } as never }),
    onSuccess: () => {
      toast.success("Salvo");
      recarrega();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (isLoading) return <p className="p-8 text-[13px] text-muted-foreground">Carregando…</p>;
  if (error)
    return (
      <p className="p-8 text-[13px] text-destructive">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );
  if (!data) return null;

  const n = data.negocio as Record<string, unknown>;
  const empresa = (n.companies as { nome?: string; segmento?: string } | null) ?? null;
  const aberto = n.status === "open";
  const etapaAtual = (data.etapas as Array<{ id: string; nome: string }>).find(
    (e) => e.id === n.stage_id,
  );

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 p-4 lg:p-8">
      <Link
        to="/comercial-pipeline"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar para o pipeline
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{String(n.nome ?? "Negócio")}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            {empresa?.nome && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {empresa.nome}
              </span>
            )}
            {data.executivoNome && <span>· {data.executivoNome}</span>}
            {data.sdrNome && <span>· trouxe: {data.sdrNome}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!aberto && (
            <Badge
              variant="outline"
              className={
                n.status === "won"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
              }
            >
              {n.status === "won" ? "Venda ganha" : "Perdido"}
            </Badge>
          )}
          {aberto && (
            <>
              <Button size="sm" onClick={() => setFechando("ganho")}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Registrar venda
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFechando("perdido")}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Marcar perda
              </Button>
            </>
          )}
        </div>
      </header>

      {/* etapas do funil, clicáveis */}
      {aberto && (
        <section className="surface-panel p-4">
          <p className="section-label mb-2">Etapa do funil</p>
          <div className="flex flex-wrap gap-1.5">
            {(
              data.etapas as Array<{
                id: string;
                nome: string;
                kind: string;
                probabilidade: number;
              }>
            )
              .filter((e) => e.kind === "open")
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={mover.isPending}
                  onClick={() => e.id !== n.stage_id && mover.mutate(e.id)}
                  className={`rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-50 ${
                    e.id === n.stage_id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50"
                  }`}
                  title={`${e.probabilidade}% de probabilidade`}
                >
                  {e.nome}
                </button>
              ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {/* registrar atividade */}
          {aberto && (
            <section className="surface-panel p-4">
              <p className="section-label mb-2">Registrar o que foi feito</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TIPOS_ATIVIDADE.map((t) => {
                  const Icone = ICONE[t.valor] ?? StickyNote;
                  return (
                    <button
                      key={t.valor}
                      type="button"
                      onClick={() => setTipo(t.valor)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                        tipo === t.valor
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icone className="h-3 w-3" />
                      {t.rotulo}
                    </button>
                  );
                })}
              </div>
              <Textarea
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que aconteceu nesse contato"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-1">
                  <Label className="text-[11px]">Próximo passo</Label>
                  <Input
                    value={proximoPasso}
                    onChange={(e) => setProximoPasso(e.target.value)}
                    placeholder="Enviar proposta revisada"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Quando</Label>
                  <Input
                    type="datetime-local"
                    value={proximoEm}
                    onChange={(e) => setProximoEm(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={registrar.isPending || (!descricao.trim() && !proximoPasso.trim())}
                  onClick={() => registrar.mutate()}
                >
                  {registrar.isPending ? "Registrando…" : "Registrar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 3);
                    d.setHours(9, 0, 0, 0);
                    setProximoEm(paraLocal(d));
                  }}
                >
                  Próximo passo em 3 dias
                </Button>
              </div>
            </section>
          )}

          {/* histórico */}
          <section className="surface-panel p-4">
            <p className="section-label mb-3">Histórico</p>
            {data.atividades.length === 0 ? (
              <p className="py-2 text-[13px] text-muted-foreground">
                Nada registrado ainda neste negócio.
              </p>
            ) : (
              <ol className="relative space-y-0 border-l border-border pl-5">
                {data.atividades.map((a) => {
                  const Icone = ICONE[a.tipo] ?? StickyNote;
                  return (
                    <li key={a.id} className="relative pb-4 last:pb-0">
                      <span className="absolute -left-[27px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-background ring-4 ring-background">
                        <Icone className="h-3 w-3 text-muted-foreground" />
                      </span>
                      <p className="text-[12px] font-medium">
                        {a.tipo === "etapa"
                          ? `Mudou de etapa${a.deEtapa ? ` · ${a.deEtapa}` : ""} → ${a.paraEtapa ?? "—"}`
                          : (TIPOS_ATIVIDADE.find((t) => t.valor === a.tipo)?.rotulo ?? a.tipo)}
                      </p>
                      {a.descricao && (
                        <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                          {a.descricao}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {format(new Date(a.occurredAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {a.autor ? ` · ${a.autor}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="surface-panel space-y-3 p-4">
            <p className="section-label">Dados do negócio</p>

            <div className="space-y-1">
              <Label className="text-[11px]">Valor</Label>
              <Input
                type="number"
                defaultValue={Number(n.amount ?? 0)}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== Number(n.amount ?? 0)) salvarCampo.mutate({ amount: v });
                }}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Temperatura</Label>
              <div className="flex gap-1.5">
                {TEMPERATURAS.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => salvarCampo.mutate({ temperatura: t.v })}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      n.temperatura === t.v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Produtos / serviços</Label>
              <Textarea
                rows={2}
                defaultValue={String(n.produtos_texto ?? "")}
                onBlur={(e) => {
                  if (e.target.value !== (n.produtos_texto ?? ""))
                    salvarCampo.mutate({ produtos_texto: e.target.value || null });
                }}
              />
            </div>

            <dl className="space-y-1 text-[11px] text-muted-foreground">
              {etapaAtual && (
                <div className="flex justify-between gap-2">
                  <dt>Etapa</dt>
                  <dd className="text-foreground">{etapaAtual.nome}</dd>
                </div>
              )}
              {n.fonte ? (
                <div className="flex justify-between gap-2">
                  <dt>Origem</dt>
                  <dd className="text-foreground">{String(n.fonte)}</dd>
                </div>
              ) : null}
              {n.ordem_compra_numero ? (
                <div className="flex justify-between gap-2">
                  <dt>Ordem de compra</dt>
                  <dd className="text-foreground">{String(n.ordem_compra_numero)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {n.proximo_passo_em ? (
            <section className="surface-panel p-4">
              <p className="section-label mb-1">Próximo passo</p>
              <p className="text-[13px]">{String(n.proximo_passo ?? "—")}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarClock className="h-3 w-3" />
                {format(new Date(String(n.proximo_passo_em)), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      {fechando && (
        <FecharDialog
          modo={fechando}
          valorAtual={Number(n.amount ?? 0)}
          onClose={() => setFechando(null)}
          onDone={recarrega}
          fechar={fecharFn}
          dealId={id}
        />
      )}
    </div>
  );
}

function FecharDialog({
  modo,
  valorAtual,
  dealId,
  onClose,
  onDone,
  fechar,
}: {
  modo: "ganho" | "perdido";
  valorAtual: number;
  dealId: string;
  onClose: () => void;
  onDone: () => void;
  fechar: ReturnType<typeof useServerFn<typeof fecharNegocio>>;
}) {
  const [oc, setOc] = useState("");
  const [ocEm, setOcEm] = useState(paraLocal(new Date()));
  const [valor, setValor] = useState(String(valorAtual || ""));
  const [briefing, setBriefing] = useState("");
  const [motivo, setMotivo] = useState("");

  const MOTIVOS = [
    "Sem orçamento",
    "Escolheu concorrente",
    "Timing inadequado",
    "Sem fit com a solução",
    "Sem retorno",
  ];

  const acao = useMutation({
    mutationFn: () =>
      modo === "ganho"
        ? fechar({
            data: {
              resultado: "ganho",
              dealId,
              ordemCompraEm: new Date(ocEm).toISOString(),
              ordemCompraNumero: oc.trim(),
              amount: Number(valor) || 0,
              observacaoAdm: briefing.trim() || undefined,
            },
          })
        : fechar({ data: { resultado: "perdido", dealId, motivo: motivo.trim() } }),
    onSuccess: () => {
      toast.success(modo === "ganho" ? "Venda registrada" : "Perda registrada");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === "ganho" ? "Registrar venda" : "Marcar perda"}</DialogTitle>
          <DialogDescription>
            {modo === "ganho"
              ? "A venda só conta com a ordem de compra. Depois disso o negócio segue para o ADM."
              : "O motivo alimenta a análise de perdas do time."}
          </DialogDescription>
        </DialogHeader>

        {modo === "ganho" ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Número da ordem de compra</Label>
                <Input
                  value={oc}
                  onChange={(e) => setOc(e.target.value)}
                  placeholder="OC-2026-0431"
                />
              </div>
              <div className="space-y-1">
                <Label>Data da ordem</Label>
                <Input
                  type="datetime-local"
                  value={ocEm}
                  onChange={(e) => setOcEm(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Valor fechado</Label>
              <Input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="18500"
              />
              {Number(valor) > 0 && (
                <p className="text-[11px] text-muted-foreground">{moeda(Number(valor))}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Briefing para o CS</Label>
              <Textarea
                rows={4}
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                placeholder="O que foi fechado, quem é o contato, o que o cliente espera e prazos combinados"
              />
              <p className="text-[11px] text-muted-foreground">
                É o que o CS vai ler quando o ADM passar o bastão.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Motivo</Label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${
                    motivo === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ou escreva o motivo"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={acao.isPending || (modo === "ganho" ? !oc.trim() : motivo.trim().length < 2)}
            onClick={() => acao.mutate()}
          >
            {acao.isPending ? "Salvando…" : modo === "ganho" ? "Registrar venda" : "Marcar perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
