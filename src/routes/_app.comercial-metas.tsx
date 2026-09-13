import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lightbulb, Target, Trash2 } from "lucide-react";
import {
  listMetasComerciais,
  removerMetaComercial,
  salvarMetaComercial,
} from "@/lib/comercial.functions";
import { moeda, quantidadeSugerida } from "@/lib/comercial/metas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/comercial-metas")({
  component: MetasPage,
  head: () => ({ meta: [{ title: "Metas comerciais | Grou Compass" }] }),
});

type MetaRow = {
  id: string;
  user_id: string;
  periodo: string;
  escopo: string;
  meta_valor: number;
  meta_quantidade: number;
  meta_agendas: number | null;
  meta_propostas: number | null;
  meta_contatos: number | null;
  observacao: string | null;
};

const ESCOPO_LABEL: Record<string, string> = {
  novos: "Novos negócios",
  carteira: "Carteira / renovação",
  ambos: "Novos + carteira",
};

/**
 * Metas do time comercial, por mês. Cada meta tem valor e quantidade, porque
 * só valor deixa passar o caso do briefing: bater R$ 50 mil com 2 negócios
 * grandes quando a empresa precisa de 12 vendas no ticket médio de R$ 4,5 mil.
 */
function MetasPage() {
  const listFn = useServerFn(listMetasComerciais);
  const salvarFn = useServerFn(salvarMetaComercial);
  const removerFn = useServerFn(removerMetaComercial);
  const qc = useQueryClient();

  const [ref, setRef] = useState(() => startOfMonth(new Date()));
  const periodo = useMemo(() => format(ref, "yyyy-MM-01"), [ref]);
  const [editando, setEditando] = useState<MetaRow | null>(null);
  const [novo, setNovo] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["metas-comerciais", periodo],
    queryFn: () => listFn({ data: { periodo } }),
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Meta removida");
      qc.invalidateQueries({ queryKey: ["metas-comerciais"] });
      qc.invalidateQueries({ queryKey: ["comercial"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const metas = (data?.metas ?? []) as MetaRow[];
  const nomeDe = new Map(
    (data?.profiles ?? []).map(
      (p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ],
    ),
  );
  const podeEditar = !!data?.isManager;

  const totalValor = metas.reduce((a, m) => a + Number(m.meta_valor ?? 0), 0);
  const totalQtd = metas.reduce((a, m) => a + Number(m.meta_quantidade ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Target className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            Metas comerciais
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Cada pessoa tem meta de valor e de quantidade. As micrometas de atividade são o que
            sustenta as duas: sem agenda e sem proposta, a meta não fecha.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setRef(subMonths(ref, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-36 text-center text-[13px] font-medium capitalize">
            {format(ref, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setRef(addMonths(ref, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {metas.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="surface-panel flex-1 p-3">
            <p className="section-label">Meta do time</p>
            <p className="metric-value mt-1 text-2xl">{moeda(totalValor)}</p>
            <p className="text-[11px] text-muted-foreground">{totalQtd} vendas somadas</p>
          </div>
          <div className="surface-panel flex-1 p-3">
            <p className="section-label">Ticket médio de referência</p>
            <p className="metric-value mt-1 text-2xl">{moeda(data?.ticketMedio ?? 0)}</p>
            <p className="text-[11px] text-muted-foreground">usado para sugerir a quantidade</p>
          </div>
        </div>
      )}

      {podeEditar && (
        <Button size="sm" onClick={() => setNovo(true)}>
          <Target className="mr-1 h-3.5 w-3.5" /> Definir meta de alguém
        </Button>
      )}
      {!podeEditar && <Badge variant="outline">Somente leitura — só a gestão define metas</Badge>}

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : metas.length === 0 ? (
        <p className="surface-panel p-6 text-center text-[13px] text-muted-foreground">
          Nenhuma meta definida para este mês.
        </p>
      ) : (
        <ul className="space-y-2">
          {metas.map((m) => (
            <li key={m.id} className="surface-panel flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{nomeDe.get(m.user_id) ?? m.user_id}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ESCOPO_LABEL[m.escopo] ?? m.escopo}
                  {m.observacao ? ` · ${m.observacao}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                <span title="Meta de valor">
                  <strong className="tabular-nums">{moeda(m.meta_valor)}</strong>
                </span>
                <span className="text-muted-foreground" title="Meta de quantidade">
                  <strong className="tabular-nums text-foreground">{m.meta_quantidade}</strong>{" "}
                  vendas
                </span>
                {m.meta_agendas ? (
                  <span className="text-muted-foreground">{m.meta_agendas} agendas</span>
                ) : null}
                {m.meta_propostas ? (
                  <span className="text-muted-foreground">{m.meta_propostas} propostas</span>
                ) : null}
              </div>
              {podeEditar && (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditando(m)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => confirm("Remover esta meta?") && remover.mutate(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {(novo || editando) && (
        <MetaDialog
          meta={editando}
          periodo={periodo}
          ticketMedio={data?.ticketMedio ?? 4500}
          pessoas={
            (data?.profiles ?? []) as Array<{
              id: string;
              full_name: string | null;
              email: string | null;
            }>
          }
          onClose={() => {
            setNovo(false);
            setEditando(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["metas-comerciais"] });
            qc.invalidateQueries({ queryKey: ["comercial"] });
          }}
          salvar={salvarFn}
        />
      )}
    </div>
  );
}

function MetaDialog({
  meta,
  periodo,
  ticketMedio,
  pessoas,
  onClose,
  onSaved,
  salvar,
}: {
  meta: MetaRow | null;
  periodo: string;
  ticketMedio: number;
  pessoas: Array<{ id: string; full_name: string | null; email: string | null }>;
  onClose: () => void;
  onSaved: () => void;
  salvar: ReturnType<typeof useServerFn<typeof salvarMetaComercial>>;
}) {
  const [userId, setUserId] = useState(meta?.user_id ?? "");
  const [escopo, setEscopo] = useState(meta?.escopo ?? "novos");
  const [valor, setValor] = useState(String(meta?.meta_valor ?? ""));
  const [quantidade, setQuantidade] = useState(String(meta?.meta_quantidade ?? ""));
  const [agendas, setAgendas] = useState(String(meta?.meta_agendas ?? ""));
  const [propostas, setPropostas] = useState(String(meta?.meta_propostas ?? ""));
  const [contatos, setContatos] = useState(String(meta?.meta_contatos ?? ""));

  const sugestao = quantidadeSugerida(Number(valor) || 0, ticketMedio);
  const divergente = sugestao > 0 && Number(quantidade) > 0 && Number(quantidade) < sugestao;

  const save = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          userId,
          periodo,
          escopo: escopo as "novos" | "carteira" | "ambos",
          meta_valor: Number(valor) || 0,
          meta_quantidade: Number(quantidade) || 0,
          meta_agendas: agendas ? Number(agendas) : null,
          meta_propostas: propostas ? Number(propostas) : null,
          meta_contatos: contatos ? Number(contatos) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Meta salva");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meta ? "Editar meta" : "Definir meta"}</DialogTitle>
          <DialogDescription>
            Período de {format(new Date(`${periodo}T12:00:00`), "MMMM 'de' yyyy", { locale: ptBR })}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Pessoa</Label>
            <Select value={userId} onValueChange={setUserId} disabled={!!meta}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha quem recebe a meta" />
              </SelectTrigger>
              <SelectContent>
                {pessoas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Escopo</Label>
            <Select value={escopo} onValueChange={setEscopo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ESCOPO_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="valor">Meta de valor (R$)</Label>
              <Input
                id="valor"
                inputMode="numeric"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="50000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qtd">Meta de vendas</Label>
              <Input
                id="qtd"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={sugestao ? String(sugestao) : "12"}
              />
            </div>
          </div>

          {sugestao > 0 && (
            <div
              className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] ${
                divergente
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Com ticket médio de {moeda(ticketMedio)}, {moeda(Number(valor) || 0)} pedem{" "}
                <strong>{sugestao} vendas</strong>.{" "}
                {divergente
                  ? "A quantidade informada está abaixo disso, então dá para bater o valor com poucos negócios grandes."
                  : ""}
                {!quantidade && (
                  <button
                    type="button"
                    className="ml-1 font-semibold text-primary hover:underline"
                    onClick={() => setQuantidade(String(sugestao))}
                  >
                    Usar {sugestao}
                  </button>
                )}
              </p>
            </div>
          )}

          <div>
            <p className="section-label mb-1.5">Micrometas de atividade</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="ag" className="text-[11px]">
                  Agendas
                </Label>
                <Input
                  id="ag"
                  inputMode="numeric"
                  value={agendas}
                  onChange={(e) => setAgendas(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pr" className="text-[11px]">
                  Propostas
                </Label>
                <Input
                  id="pr"
                  inputMode="numeric"
                  value={propostas}
                  onChange={(e) => setPropostas(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ct" className="text-[11px]">
                  Contatos
                </Label>
                <Input
                  id="ct"
                  inputMode="numeric"
                  value={contatos}
                  onChange={(e) => setContatos(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!userId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Salvar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
