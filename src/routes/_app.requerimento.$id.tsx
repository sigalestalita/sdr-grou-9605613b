import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  getRequerimento,
  salvarCronograma,
  salvarRequerimento,
  trainerRegistra,
  trainerStatusSessao,
} from "@/lib/requerimentos.functions";
import {
  logisticaPadrao,
  logisticaPendente,
  STATUS_REQUERIMENTO,
  type ItemLogistica,
} from "@/lib/requerimentos/regras";
import { dataBr } from "@/components/faturamento/faturamento-do-negocio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/requerimento/$id")({
  component: RequerimentoPage,
  head: () => ({ meta: [{ title: "Requerimento | Grou Compass" }] }),
});

type Campos = Record<string, string | boolean | null | ItemLogistica[]>;

const CLIENTE: Array<[string, string]> = [
  ["contratante_nome", "Nome do contratante"],
  ["contratante_email", "E-mail"],
  ["contratante_telefone", "Telefone"],
  ["contratante_cargo", "Cargo"],
  ["contratante_area", "Área"],
  ["plataforma", "Plataforma"],
];
const SERVICO: Array<[string, string]> = [
  ["servico", "Serviço"],
  ["publico", "Público"],
  ["quantidade", "Quantidade"],
  ["produtos_avaliacao", "Produto (PDA | DG | QR)"],
  ["carga_horaria", "Carga horária"],
  ["data_texto", "Data"],
  ["horario_texto", "Horário (Brasília)"],
  ["local", "Local"],
  ["cidade_uf", "Cidade/Estado"],
  ["base_avaliacao", "Base da avaliação"],
  ["plataforma_transmissao", "Plataforma de transmissão"],
  ["lista_participantes_url", "Link da lista de participantes"],
];
const GRUPO: Record<ItemLogistica["grupo"], string> = {
  online: "Formato online",
  presencial: "Formato presencial",
  assessment: "Assessment",
};

/**
 * O requerimento de serviço, no mesmo formato do documento que o ADM monta
 * hoje: cliente, serviço, logística com responsável por item, cronograma por
 * módulo e trainer, briefing e conclusão da trainer.
 */
function RequerimentoPage() {
  const { id } = useParams({ from: "/_app/requerimento/$id" });
  const qc = useQueryClient();
  const fn = useServerFn(getRequerimento);
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["requerimento", id],
    queryFn: () => fn({ data: { id } }),
    // os formulários reiniciam a cada dado novo; sem refetch no foco para não
    // apagar o que a pessoa está digitando
    refetchOnWindowFocus: false,
  });
  const recarrega = () => {
    qc.invalidateQueries({ queryKey: ["requerimento", id] });
    qc.invalidateQueries({ queryKey: ["requerimentos"] });
  };

  if (isLoading) return <p className="p-8 text-[13px] text-muted-foreground">Carregando…</p>;
  if (error || !data)
    return (
      <p className="p-8 text-[13px] text-destructive">
        {error instanceof Error ? error.message : "Erro"}
      </p>
    );

  const r = data.requerimento;
  const empresa = (r.companies as { nome?: string } | null)?.nome ?? null;
  const editavel = data.podeEditarTudo || data.podeEditarComoCriador;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 lg:p-8">
      <Link
        to="/requerimentos"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Requerimentos
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Requerimento nº {String(r.numero)} · {empresa ?? "—"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {String(r.servico)}
            {r.deal_id ? (
              <>
                {" · "}
                <Link
                  to="/negocio/$id"
                  params={{ id: String(r.deal_id) }}
                  className="text-primary hover:underline"
                >
                  ver negócio
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Andamento
          id={id}
          status={String(r.status)}
          podeMudar={data.podeEditarTudo}
          onDone={recarrega}
        />
      </header>

      <Formulario
        key={`formulario-${dataUpdatedAt}`}
        id={id}
        requerimento={r}
        editavel={editavel}
        podeEditarTudo={data.podeEditarTudo}
        pessoas={data.nomes}
        onDone={recarrega}
      />

      <Cronograma
        key={`cronograma-${dataUpdatedAt}`}
        id={id}
        sessoes={data.sessoes}
        trainerIds={data.trainerIds}
        disponiveis={data.trainersDisponiveis}
        nomes={data.nomes}
        podeEditar={data.podeEditarTudo}
        onDone={recarrega}
      />

      <Entrega
        key={`entrega-${dataUpdatedAt}`}
        id={id}
        requerimento={r}
        podeEditar={data.souTrainer || data.podeEditarTudo}
        onDone={recarrega}
      />
    </div>
  );
}

function Andamento({
  id,
  status,
  podeMudar,
  onDone,
}: {
  id: string;
  status: string;
  podeMudar: boolean;
  onDone: () => void;
}) {
  const salvarFn = useServerFn(salvarRequerimento);
  const mudar = useMutation({
    mutationFn: (s: string) => salvarFn({ data: { id, status: s as never } }),
    onSuccess: () => {
      toast.success("Andamento atualizado");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <select
      className="h-9 rounded-md border bg-background px-2 text-[13px]"
      value={status}
      disabled={!podeMudar || mudar.isPending}
      onChange={(e) => mudar.mutate(e.target.value)}
    >
      {STATUS_REQUERIMENTO.map((s) => (
        <option key={s.v} value={s.v}>
          {s.l}
        </option>
      ))}
    </select>
  );
}

function Formulario({
  id,
  requerimento,
  editavel,
  podeEditarTudo,
  pessoas,
  onDone,
}: {
  id: string;
  requerimento: Record<string, unknown>;
  editavel: boolean;
  podeEditarTudo: boolean;
  pessoas: Record<string, string>;
  onDone: () => void;
}) {
  const salvarFn = useServerFn(salvarRequerimento);
  const inicial: Campos = Object.fromEntries(
    [...CLIENTE, ...SERVICO].map(([k]) => [k, (requerimento[k] as string | null) ?? ""]),
  );
  const [f, setF] = useState<Campos>({
    ...inicial,
    contexto_cliente: (requerimento.contexto_cliente as string | null) ?? "",
    objetivo: (requerimento.objetivo as string | null) ?? "",
    observacoes_adm: (requerimento.observacoes_adm as string | null) ?? "",
    formato: (requerimento.formato as string | null) ?? "online",
    materiais: (requerimento.materiais as boolean | null) ?? null,
    apoio_adm_id: (requerimento.apoio_adm_id as string | null) ?? "",
  });
  const [logistica, setLogistica] = useState<ItemLogistica[]>(
    ((requerimento.logistica as ItemLogistica[] | null) ?? []).length
      ? (requerimento.logistica as ItemLogistica[])
      : logisticaPadrao((requerimento.formato as "online" | null) ?? "online"),
  );
  const set = (k: string, v: string | boolean | null) => setF((x) => ({ ...x, [k]: v }));

  const salvar = useMutation({
    mutationFn: () => {
      const texto = (k: string) => {
        const v = String(f[k] ?? "").trim();
        return v || null;
      };
      return salvarFn({
        data: {
          id,
          ...(Object.fromEntries(
            [...CLIENTE, ...SERVICO].filter(([k]) => k !== "servico").map(([k]) => [k, texto(k)]),
          ) as Record<string, string | null>),
          servico: texto("servico") ?? String(requerimento.servico),
          contexto_cliente: texto("contexto_cliente"),
          objetivo: texto("objetivo"),
          ...(podeEditarTudo
            ? {
                observacoes_adm: texto("observacoes_adm"),
                apoio_adm_id: texto("apoio_adm_id"),
              }
            : {}),
          formato: (f.formato || null) as "online" | "presencial" | "hibrido" | null,
          materiais: f.materiais as boolean | null,
          logistica,
        },
      });
    },
    onSuccess: () => {
      toast.success("Requerimento salvo");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const campo = ([k, rotulo]: [string, string]) => (
    <div key={k} className="space-y-1">
      <Label className="text-[11px]">{rotulo}</Label>
      <Input
        value={String(f[k] ?? "")}
        disabled={!editavel}
        onChange={(e) => set(k, e.target.value)}
      />
    </div>
  );
  const pendentes = logisticaPendente(logistica);
  const grupos = [...new Set(logistica.map((i) => i.grupo))];

  return (
    <div className="space-y-4">
      <section className="surface-panel space-y-3 p-4">
        <p className="section-label">Informações do cliente</p>
        <div className="grid gap-3 sm:grid-cols-3">{CLIENTE.map(campo)}</div>
        <div className="space-y-1">
          <Label className="text-[11px]">Contexto / histórico do cliente</Label>
          <Textarea
            rows={3}
            value={String(f.contexto_cliente ?? "")}
            disabled={!editavel}
            onChange={(e) => set("contexto_cliente", e.target.value)}
          />
        </div>
      </section>

      <section className="surface-panel space-y-3 p-4">
        <p className="section-label">Serviço / projeto</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {SERVICO.map(campo)}
          <div className="space-y-1">
            <Label className="text-[11px]">Formato</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
              value={String(f.formato ?? "")}
              disabled={!editavel}
              onChange={(e) => set("formato", e.target.value)}
            >
              <option value="online">Online</option>
              <option value="presencial">Presencial</option>
              <option value="hibrido">Online e presencial</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pt-5 text-[13px]">
            <input
              type="checkbox"
              checked={f.materiais === true}
              disabled={!editavel}
              onChange={(e) => set("materiais", e.target.checked)}
            />
            Precisa de materiais
          </label>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Objetivo do projeto (comercial)</Label>
          <Textarea
            rows={3}
            value={String(f.objetivo ?? "")}
            disabled={!editavel}
            onChange={(e) => set("objetivo", e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <div className="space-y-1">
            <Label className="text-[11px]">Observações gerais do projeto (ADM)</Label>
            <Textarea
              rows={3}
              value={String(f.observacoes_adm ?? "")}
              disabled={!podeEditarTudo}
              onChange={(e) => set("observacoes_adm", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Apoio Grou (ADM)</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
              value={String(f.apoio_adm_id ?? "")}
              disabled={!podeEditarTudo}
              onChange={(e) => set("apoio_adm_id", e.target.value)}
            >
              <option value="">—</option>
              {Object.entries(pessoas).map(([pid, nome]) => (
                <option key={pid} value={pid}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="surface-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="section-label">Logística</p>
          {editavel && (
            <div className="flex gap-1.5">
              {(["online", "presencial", "assessment"] as const)
                .filter((g) => !grupos.includes(g))
                .map((g) => (
                  <Button
                    key={g}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLogistica([
                        ...logistica,
                        ...logisticaPadrao(
                          g === "assessment" ? null : g,
                          g === "assessment",
                        ).filter((i) => i.grupo === g),
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3 w-3" /> {GRUPO[g]}
                  </Button>
                ))}
            </div>
          )}
        </div>
        {pendentes.length > 0 && (
          <p className="text-[12px] text-amber-700 dark:text-amber-400">
            {pendentes.length} item(ns) necessário(s) sem responsável.
          </p>
        )}
        {grupos.map((g) => (
          <div key={g} className="space-y-1">
            <p className="text-[12px] font-medium">{GRUPO[g]}</p>
            {logistica.map((it, idx) =>
              it.grupo !== g ? null : (
                <div
                  key={idx}
                  className="grid items-center gap-1.5 text-[12px] sm:grid-cols-[1fr_7rem_10rem_1fr]"
                >
                  <span>{it.item}</span>
                  <select
                    className="h-8 rounded-md border bg-background px-1.5"
                    value={it.necessario === null ? "" : it.necessario ? "sim" : "nao"}
                    disabled={!editavel}
                    onChange={(e) => {
                      const nova = [...logistica];
                      nova[idx] = {
                        ...it,
                        necessario: e.target.value === "" ? null : e.target.value === "sim",
                      };
                      setLogistica(nova);
                    }}
                  >
                    <option value="">—</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                  <Input
                    className="h-8"
                    value={it.responsavel}
                    disabled={!editavel}
                    placeholder="Responsável"
                    onChange={(e) => {
                      const nova = [...logistica];
                      nova[idx] = { ...it, responsavel: e.target.value };
                      setLogistica(nova);
                    }}
                  />
                  <Input
                    className="h-8"
                    value={it.observacao}
                    disabled={!editavel}
                    placeholder="Ações / observações"
                    onChange={(e) => {
                      const nova = [...logistica];
                      nova[idx] = { ...it, observacao: e.target.value };
                      setLogistica(nova);
                    }}
                  />
                </div>
              ),
            )}
          </div>
        ))}
      </section>

      {editavel ? (
        <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : "Salvar requerimento"}
        </Button>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Somente leitura: depois que o ADM pega o requerimento, só ele edita.
        </p>
      )}
    </div>
  );
}

type Sessao = {
  id?: string;
  titulo: string;
  trainer_id: string | null;
  data: string | null;
  horario: string | null;
  formato: "online" | "presencial" | null;
  local: string | null;
  status: "a_confirmar" | "confirmado" | "realizado" | "cancelado";
};
const STATUS_SESSAO: Record<Sessao["status"], string> = {
  a_confirmar: "A confirmar",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

function Cronograma({
  id,
  sessoes,
  trainerIds,
  disponiveis,
  nomes,
  podeEditar,
  onDone,
}: {
  id: string;
  sessoes: Array<Record<string, unknown>>;
  trainerIds: string[];
  disponiveis: Array<{ id: string; nome: string }>;
  nomes: Record<string, string>;
  podeEditar: boolean;
  onDone: () => void;
}) {
  const salvarFn = useServerFn(salvarCronograma);
  const statusFn = useServerFn(trainerStatusSessao);
  const [lista, setLista] = useState<Sessao[]>(
    sessoes.map((s) => ({
      id: s.id as string,
      titulo: String(s.titulo ?? ""),
      trainer_id: (s.trainer_id as string | null) ?? null,
      data: (s.data as string | null) ?? null,
      horario: (s.horario as string | null) ?? null,
      formato: (s.formato as Sessao["formato"]) ?? null,
      local: (s.local as string | null) ?? null,
      status: (s.status as Sessao["status"]) ?? "a_confirmar",
    })),
  );
  const [trainers, setTrainers] = useState<string[]>(trainerIds);

  const statusOriginal = new Map(sessoes.map((x) => [x.id as string, x.status as string]));
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          id,
          trainerIds: trainers,
          sessoes: lista.map(({ status, ...x }) =>
            !x.id || statusOriginal.get(x.id) !== status ? { ...x, status } : x,
          ),
        },
      }),
    onSuccess: () => {
      toast.success("Cronograma salvo");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const mudarStatus = useMutation({
    mutationFn: (v: { sessaoId: string; status: "a_confirmar" | "confirmado" | "realizado" }) =>
      statusFn({ data: v }),
    onSuccess: () => {
      toast.success("Sessão atualizada");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const muda = (idx: number, patch: Partial<Sessao>) =>
    setLista(lista.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const opcoesTrainer = disponiveis.length
    ? disponiveis
    : Object.entries(nomes).map(([pid, nome]) => ({ id: pid, nome }));

  return (
    <section className="surface-panel space-y-3 p-4">
      <p className="section-label">Trainers e cronograma</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-muted-foreground">Trainers:</span>
        {trainers.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            {nomes[t] ?? "…"}
            {podeEditar && (
              <button type="button" onClick={() => setTrainers(trainers.filter((x) => x !== t))}>
                ×
              </button>
            )}
          </span>
        ))}
        {podeEditar && (
          <select
            className="h-7 rounded-md border bg-background px-1.5 text-[12px]"
            value=""
            onChange={(e) =>
              e.target.value &&
              !trainers.includes(e.target.value) &&
              setTrainers([...trainers, e.target.value])
            }
          >
            <option value="">Escalar trainer</option>
            {opcoesTrainer
              .filter((p) => !trainers.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {lista.length === 0 && (
          <p className="text-[12px] text-muted-foreground">Nenhuma sessão no cronograma.</p>
        )}
        {lista.map((s, idx) =>
          podeEditar ? (
            <div
              key={s.id ?? `n${idx}`}
              className="grid items-center gap-1.5 rounded-md border p-2 text-[12px] sm:grid-cols-[1.5fr_1fr_8.5rem_6rem_6.5rem_1fr_7rem_auto]"
            >
              <Input
                className="h-8"
                value={s.titulo}
                placeholder="Módulo"
                onChange={(e) => muda(idx, { titulo: e.target.value })}
              />
              <select
                className="h-8 rounded-md border bg-background px-1.5"
                value={s.trainer_id ?? ""}
                onChange={(e) => muda(idx, { trainer_id: e.target.value || null })}
              >
                <option value="">Trainer</option>
                {opcoesTrainer.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <Input
                className="h-8"
                type="date"
                value={s.data ?? ""}
                onChange={(e) => muda(idx, { data: e.target.value || null })}
              />
              <Input
                className="h-8"
                value={s.horario ?? ""}
                placeholder="09h–12h"
                onChange={(e) => muda(idx, { horario: e.target.value || null })}
              />
              <select
                className="h-8 rounded-md border bg-background px-1.5"
                value={s.formato ?? ""}
                onChange={(e) =>
                  muda(idx, { formato: (e.target.value || null) as Sessao["formato"] })
                }
              >
                <option value="">Formato</option>
                <option value="online">Online</option>
                <option value="presencial">Presencial</option>
              </select>
              <Input
                className="h-8"
                value={s.local ?? ""}
                placeholder="Local"
                onChange={(e) => muda(idx, { local: e.target.value || null })}
              />
              <select
                className="h-8 rounded-md border bg-background px-1.5"
                value={s.status}
                onChange={(e) => muda(idx, { status: e.target.value as Sessao["status"] })}
              >
                {Object.entries(STATUS_SESSAO).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setLista(lista.filter((_, i) => i !== idx))}
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-[12px]"
            >
              <span>
                <strong>{s.titulo}</strong> · {s.trainer_id ? nomes[s.trainer_id] : "sem trainer"} ·{" "}
                {dataBr(s.data)} {s.horario ?? ""} {s.formato ? `· ${s.formato}` : ""}
                {s.local ? ` · ${s.local}` : ""}
              </span>
              <select
                className="h-7 rounded-md border bg-background px-1.5"
                value={s.status}
                disabled={!s.id || s.status === "cancelado" || mudarStatus.isPending}
                onChange={(e) =>
                  s.id &&
                  mudarStatus.mutate({
                    sessaoId: s.id,
                    status: e.target.value as "a_confirmar" | "confirmado" | "realizado",
                  })
                }
              >
                {Object.entries(STATUS_SESSAO)
                  .filter(([v]) => v !== "cancelado" || s.status === "cancelado")
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </div>
          ),
        )}
      </div>
      {podeEditar && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLista([
                ...lista,
                {
                  titulo: `Módulo ${lista.length + 1}`,
                  trainer_id: null,
                  data: null,
                  horario: null,
                  formato: null,
                  local: null,
                  status: "a_confirmar",
                },
              ])
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Sessão
          </Button>
          <Button
            size="sm"
            disabled={salvar.isPending || lista.some((s) => !s.titulo.trim())}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? "Salvando…" : "Salvar cronograma"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Entrega({
  id,
  requerimento,
  podeEditar,
  onDone,
}: {
  id: string;
  requerimento: Record<string, unknown>;
  podeEditar: boolean;
  onDone: () => void;
}) {
  const fn = useServerFn(trainerRegistra);
  const [briefingEm, setBriefingEm] = useState((requerimento.briefing_em as string | null) ?? "");
  const [briefing, setBriefing] = useState((requerimento.briefing_texto as string | null) ?? "");
  const [conclusaoEm, setConclusaoEm] = useState(
    (requerimento.conclusao_em as string | null) ?? "",
  );
  const [conclusao, setConclusao] = useState((requerimento.conclusao_texto as string | null) ?? "");
  const salvar = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id,
          briefingEm: briefingEm || null,
          briefingTexto: briefing.trim() || null,
          conclusaoEm: conclusaoEm || null,
          conclusaoTexto: conclusao.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Registro da trainer salvo");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <section className="surface-panel space-y-3 p-4">
      <p className="section-label">Operação (trainer)</p>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1">
          <Label className="text-[11px]">Data do briefing</Label>
          <Input
            type="date"
            value={briefingEm}
            disabled={!podeEditar}
            onChange={(e) => setBriefingEm(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Briefing — execução</Label>
          <Textarea
            rows={5}
            value={briefing}
            disabled={!podeEditar}
            onChange={(e) => setBriefing(e.target.value)}
            placeholder="Características do grupo, necessidades, formato combinado com o RH…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Data de fechamento</Label>
          <Input
            type="date"
            value={conclusaoEm}
            disabled={!podeEditar}
            onChange={(e) => setConclusaoEm(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Conclusão da entrega — relato para o comercial</Label>
          <Textarea
            rows={4}
            value={conclusao}
            disabled={!podeEditar}
            onChange={(e) => setConclusao(e.target.value)}
            placeholder="Como foi, aceitação do grupo, oportunidades que apareceram"
          />
        </div>
      </div>
      {podeEditar && (
        <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : "Salvar registro"}
        </Button>
      )}
      {!podeEditar && (
        <p className="text-[12px] text-muted-foreground">Quem registra é a trainer escalada.</p>
      )}
    </section>
  );
}
