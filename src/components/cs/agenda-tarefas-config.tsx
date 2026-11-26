import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarOff, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import {
  lerAgendaTarefas,
  removerAusencia,
  salvarAgendaTarefas,
  salvarAusencia,
} from "@/lib/cs-agenda-tarefas.functions";
import { AGENDA_PADRAO, FERIADOS_NACIONAIS, type ConfigAgenda } from "@/lib/cs/agenda-tarefas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Profile = { id: string; full_name: string | null; email: string | null };

const DIAS = [
  { v: 1, l: "Seg" },
  { v: 2, l: "Ter" },
  { v: 3, l: "Qua" },
  { v: 4, l: "Qui" },
  { v: 5, l: "Sex" },
  { v: 6, l: "Sáb" },
  { v: 0, l: "Dom" },
];
const MOTIVOS = ["férias", "licença", "folga", "atestado", "treinamento", "outro"];
const SELECT = "h-8 rounded-md border bg-background px-2 text-[12px]";
const dataBr = (ymd: string) => format(new Date(`${ymd}T12:00:00`), "dd/MM/yyyy");

/**
 * Configurações CS → Agenda de tarefas: em que dias e horários o time recebe
 * tarefas, quantos atendimentos por dia, exceções por pessoa, feriados e
 * ausências. Dia indisponível não recebe card no kanban nem tarefa nova: o
 * que cairia nele vai para o próximo dia disponível.
 */
export function AgendaTarefasConfig({ profiles }: { profiles: Profile[] }) {
  const qc = useQueryClient();
  const lerFn = useServerFn(lerAgendaTarefas);
  const salvarFn = useServerFn(salvarAgendaTarefas);
  const { data, isLoading } = useQuery({
    queryKey: ["cs-agenda-tarefas"],
    queryFn: () => lerFn(),
  });
  const [cfg, setCfg] = useState<ConfigAgenda>(AGENDA_PADRAO);
  useEffect(() => {
    if (data) setCfg(data.config);
  }, [data]);
  const nome = (id: string | null | undefined) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { config: cfg } }),
    onSuccess: () => {
      toast.success("Agenda de tarefas salva");
      qc.invalidateQueries({ queryKey: ["cs-agenda-tarefas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const alternarDia = (lista: number[], d: number) =>
    lista.includes(d) ? lista.filter((x) => x !== d) : [...lista, d].sort();

  const [novoFeriado, setNovoFeriado] = useState({ data: "", nome: "" });
  const [pessoaExc, setPessoaExc] = useState("");

  if (isLoading) return <p className="text-[13px] text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6">
      <p className="max-w-[80ch] text-[13px] text-muted-foreground">
        Defina quando o time recebe tarefas. Em feriados, dias que a pessoa não trabalha e ausências
        (férias, licença, folga), o kanban semanal não põe card e as tarefas novas ou reagendadas
        vão para o próximo dia disponível — assim nada acumula. Quem está ausente também não é
        cobrado nas escalações.
      </p>

      <section className="space-y-3">
        <p className="section-label">Expediente do time</p>
        <div className="flex flex-wrap items-center gap-2">
          {DIAS.map((d) => (
            <button
              key={d.v}
              type="button"
              onClick={() => setCfg({ ...cfg, dias: alternarDia(cfg.dias, d.v) })}
              className={`rounded-md border px-2.5 py-1 text-[12px] ${
                cfg.dias.includes(d.v)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {d.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1.5">
            Das
            <Input
              type="time"
              value={cfg.inicio}
              onChange={(e) => setCfg({ ...cfg, inicio: e.target.value })}
              className="h-8 w-28"
            />
          </label>
          <label className="flex items-center gap-1.5">
            às
            <Input
              type="time"
              value={cfg.fim}
              onChange={(e) => setCfg({ ...cfg, fim: e.target.value })}
              className="h-8 w-28"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Atendimentos por dia (kanban)
            <Input
              type="number"
              min={1}
              max={50}
              value={cfg.atendimentos_por_dia}
              onChange={(e) =>
                setCfg({ ...cfg, atendimentos_por_dia: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-8 w-20"
            />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tarefa que cai em dia indisponível vai para o próximo dia disponível, no horário de
          início.
        </p>
      </section>

      <section className="space-y-2">
        <p className="section-label">Exceções por pessoa</p>
        {Object.entries(cfg.por_pessoa).map(([uid, p]) => (
          <div
            key={uid}
            className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-[12px]"
          >
            <span className="w-40 truncate font-medium">{nome(uid)}</span>
            {DIAS.map((d) => {
              const dias = p.dias?.length ? p.dias : cfg.dias;
              return (
                <button
                  key={d.v}
                  type="button"
                  onClick={() =>
                    setCfg({
                      ...cfg,
                      por_pessoa: {
                        ...cfg.por_pessoa,
                        [uid]: { ...p, dias: alternarDia(dias, d.v) },
                      },
                    })
                  }
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${
                    dias.includes(d.v)
                      ? "border-primary bg-primary/15 text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {d.l}
                </button>
              );
            })}
            <label className="flex items-center gap-1">
              por dia
              <Input
                type="number"
                min={1}
                max={50}
                value={p.atendimentos_por_dia ?? cfg.atendimentos_por_dia}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    por_pessoa: {
                      ...cfg.por_pessoa,
                      [uid]: {
                        ...p,
                        atendimentos_por_dia: Math.max(1, Number(e.target.value) || 1),
                      },
                    },
                  })
                }
                className="h-7 w-16"
              />
            </label>
            <button
              type="button"
              className="ml-auto text-muted-foreground hover:text-destructive"
              title="Tirar exceção"
              onClick={() => {
                const { [uid]: _fora, ...resto } = cfg.por_pessoa;
                setCfg({ ...cfg, por_pessoa: resto });
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <select
            className={SELECT}
            value={pessoaExc}
            onChange={(e) => setPessoaExc(e.target.value)}
          >
            <option value="">Pessoa com agenda diferente…</option>
            {profiles
              .filter((p) => !cfg.por_pessoa[p.id])
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!pessoaExc}
            onClick={() => {
              setCfg({
                ...cfg,
                por_pessoa: { ...cfg.por_pessoa, [pessoaExc]: { dias: [...cfg.dias] } },
              });
              setPessoaExc("");
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ex.: quem não trabalha às sextas ou atende menos clientes por dia.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="section-label">Feriados ({cfg.feriados.length})</p>
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => {
              const datas = new Set(cfg.feriados.map((f) => f.data));
              setCfg({
                ...cfg,
                feriados: [
                  ...cfg.feriados,
                  ...FERIADOS_NACIONAIS.filter((f) => !datas.has(f.data)),
                ],
              });
            }}
          >
            Repor feriados nacionais
          </button>
        </div>
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {[...cfg.feriados]
            .sort((a, b) => a.data.localeCompare(b.data))
            .map((f) => (
              <span
                key={f.data}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
              >
                {dataBr(f.data)} · {f.nome}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setCfg({ ...cfg, feriados: cfg.feriados.filter((x) => x.data !== f.data) })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={novoFeriado.data}
            onChange={(e) => setNovoFeriado({ ...novoFeriado, data: e.target.value })}
            className="h-8 w-40"
          />
          <Input
            value={novoFeriado.nome}
            onChange={(e) => setNovoFeriado({ ...novoFeriado, nome: e.target.value })}
            placeholder="Nome (ex.: Aniversário de Porto Alegre)"
            className="h-8 w-72"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!novoFeriado.data || !novoFeriado.nome.trim()}
            onClick={() => {
              setCfg({
                ...cfg,
                feriados: [
                  ...cfg.feriados.filter((x) => x.data !== novoFeriado.data),
                  { data: novoFeriado.data, nome: novoFeriado.nome.trim() },
                ],
              });
              setNovoFeriado({ data: "", nome: "" });
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Feriado
          </Button>
        </div>
      </section>

      <div className="flex justify-end border-t pt-3">
        <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
          <Save className="mr-1 h-4 w-4" /> {salvar.isPending ? "Salvando…" : "Salvar agenda"}
        </Button>
      </div>

      <Ausencias profiles={profiles} nome={nome} ausencias={data?.ausencias ?? []} />
    </div>
  );
}

type AusenciaLinha = {
  id: string;
  userId: string;
  inicio: string;
  fim: string;
  motivo?: string | null;
  substitutoId: string | null;
  observacao: string | null;
};

function Ausencias({
  profiles,
  nome,
  ausencias,
}: {
  profiles: Profile[];
  nome: (id: string | null | undefined) => string;
  ausencias: AusenciaLinha[];
}) {
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarAusencia);
  const removerFn = useServerFn(removerAusencia);
  const vazio = {
    userId: "",
    inicio: "",
    fim: "",
    motivo: "férias",
    substitutoId: "",
    observacao: "",
    tarefas: "remarcar" as "remarcar" | "substituto" | "manter",
  };
  const [f, setF] = useState(vazio);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["cs-agenda-tarefas"] });
    qc.invalidateQueries({ queryKey: ["cs-cadence-tasks"] });
  };
  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          userId: f.userId,
          inicio: f.inicio,
          fim: f.fim || f.inicio,
          motivo: f.motivo,
          substitutoId: f.substitutoId || null,
          observacao: f.observacao.trim() || null,
          tarefas: f.tarefas,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `Ausência lançada${r.tarefas ? ` · ${r.tarefas} tarefa(s)` : ""}${r.cards ? ` · ${r.cards} card(s) da cadência` : ""} ${
          f.tarefas === "substituto"
            ? "passadas ao substituto"
            : f.tarefas === "remarcar"
              ? "remarcadas"
              : ""
        }`.trim(),
      );
      setF(vazio);
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ausência removida");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-2 border-t pt-4">
      <p className="section-label flex items-center gap-1.5">
        <CalendarOff className="h-3.5 w-3.5" /> Ausências (férias, licença, folga)
      </p>
      {ausencias.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nenhuma ausência lançada.</p>
      ) : (
        <div className="divide-y rounded-md border text-[12px]">
          {ausencias.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="font-medium">{nome(a.userId)}</span>
              <span>
                {dataBr(a.inicio)} a {dataBr(a.fim)}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {a.motivo ?? "ausência"}
              </Badge>
              {a.inicio <= hoje && hoje <= a.fim && (
                <Badge className="text-[10px]">ausente hoje</Badge>
              )}
              {a.substitutoId && (
                <span className="text-muted-foreground">substituto: {nome(a.substitutoId)}</span>
              )}
              {a.observacao && <span className="text-muted-foreground">· {a.observacao}</span>}
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                title="Remover ausência"
                onClick={() => {
                  if (window.confirm("Remover esta ausência? As tarefas já remarcadas não voltam."))
                    remover.mutate(a.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-md border p-3 text-[12px]">
        <p className="font-medium">Lançar ausência</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={SELECT}
            value={f.userId}
            onChange={(e) => setF({ ...f, userId: e.target.value })}
          >
            <option value="">Quem…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={f.inicio}
            onChange={(e) => setF({ ...f, inicio: e.target.value })}
            className="h-8 w-40"
          />
          <span>a</span>
          <Input
            type="date"
            value={f.fim}
            min={f.inicio}
            onChange={(e) => setF({ ...f, fim: e.target.value })}
            className="h-8 w-40"
          />
          <select
            className={SELECT}
            value={f.motivo}
            onChange={(e) => setF({ ...f, motivo: e.target.value })}
          >
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            className={SELECT}
            value={f.substitutoId}
            onChange={(e) =>
              setF({
                ...f,
                substitutoId: e.target.value,
                tarefas: !e.target.value && f.tarefas === "substituto" ? "remarcar" : f.tarefas,
              })
            }
          >
            <option value="">Sem substituto</option>
            {profiles
              .filter((p) => p.id !== f.userId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Substituto: {p.full_name || p.email}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">Tarefas e cards do período:</span>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={f.tarefas === "remarcar"}
              onChange={() => setF({ ...f, tarefas: "remarcar" })}
            />
            remarcar para a volta
          </label>
          <label className={`flex items-center gap-1 ${f.substitutoId ? "" : "opacity-50"}`}>
            <input
              type="radio"
              disabled={!f.substitutoId}
              checked={f.tarefas === "substituto"}
              onChange={() => setF({ ...f, tarefas: "substituto" })}
            />
            passar ao substituto
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={f.tarefas === "manter"}
              onChange={() => setF({ ...f, tarefas: "manter" })}
            />
            deixar como está
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={f.observacao}
            onChange={(e) => setF({ ...f, observacao: e.target.value })}
            placeholder="Observação (opcional)"
            className="h-8 flex-1"
            maxLength={300}
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!f.userId || !f.inicio || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Lançar ausência
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Com substituto, ele passa a ver a carteira no período. “Remarcar” leva as tarefas para o
          primeiro dia disponível depois da volta e tira os cards da cadência do período (o cliente
          volta na próxima semana disponível).
        </p>
      </div>
    </section>
  );
}
