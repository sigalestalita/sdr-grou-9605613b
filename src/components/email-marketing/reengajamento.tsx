import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import {
  contarReengajamento,
  criarReengajamento,
  listarCampanhas,
} from "@/lib/email-marketing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Criterio = "nao_abriu" | "nao_clicou";
export const ROTULO_CRITERIO: Record<Criterio, string> = {
  nao_abriu: "Não abriu",
  nao_clicou: "Não clicou",
};

/** "AAAA-MM-DDTHH:mm" no fuso local. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const paraIso = (local: string) => {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Quantas pessoas entram no reengajamento, recalculado a cada mudança. */
export function useContagemReengajamento(
  origem: string | null | undefined,
  criterio: Criterio | null | undefined,
  ate: string | null | undefined,
) {
  const fn = useServerFn(contarReengajamento);
  return useQuery({
    queryKey: ["email-mkt", "reengajamento", origem, criterio, ate],
    queryFn: () => fn({ data: { origem: origem!, criterio: criterio!, ate: ate ?? null } }),
    enabled: !!origem && !!criterio,
  });
}

function EscolhaCriterio({
  valor,
  onChange,
}: {
  valor: Criterio;
  onChange: (c: Criterio) => void;
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Quem recebe">
      {(Object.keys(ROTULO_CRITERIO) as Criterio[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          onClick={() => onChange(c)}
          className={`rounded-full border px-3 py-1 text-[12px] ${
            valor === c
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {ROTULO_CRITERIO[c]}
        </button>
      ))}
    </div>
  );
}

/**
 * Botão na campanha enviada: cria a campanha de reengajamento para quem não
 * abriu ou não clicou até a data escolhida, e abre o editor dela.
 */
export function ReengajarBotao({ campanhaId, enviados }: { campanhaId: string; enviados: number }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const criarFn = useServerFn(criarReengajamento);
  const [aberto, setAberto] = useState(false);
  const [criterio, setCriterio] = useState<Criterio>("nao_abriu");
  const [ate, setAte] = useState(() => localInput(new Date()));
  const ateIso = paraIso(ate);
  const { data: contagem, isFetching } = useContagemReengajamento(
    aberto ? campanhaId : null,
    criterio,
    ateIso,
  );
  const criar = useMutation({
    mutationFn: () => criarFn({ data: { id: campanhaId, criterio, ate: ateIso } }),
    onSuccess: (r) => {
      toast.success("Campanha de reengajamento criada: ajuste o assunto e o texto antes de enviar");
      qc.invalidateQueries({ queryKey: ["email-mkt", "campanhas"] });
      setAberto(false);
      navigate({ to: "/email-marketing/campanha/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  if (enviados <= 0) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reengajar
      </Button>
      {aberto && (
        <Dialog open onOpenChange={(o) => !o && setAberto(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reengajar esta campanha</DialogTitle>
              <DialogDescription>
                Cria uma nova campanha, com o mesmo conteúdo para você ajustar, que vai só para quem
                recebeu esta e não abriu ou não clicou até a data.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-[13px]">
              <div className="space-y-1.5">
                <p className="text-[12px] text-muted-foreground">Quem recebe</p>
                <EscolhaCriterio valor={criterio} onChange={setCriterio} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="reeng-ate" className="text-[12px] text-muted-foreground">
                  {criterio === "nao_abriu" ? "Não abriu até" : "Não clicou até"}
                </label>
                <Input
                  id="reeng-ate"
                  type="datetime-local"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Data no futuro vale como “até a hora do envio”: a lista é montada quando a nova
                  campanha sair.
                </p>
              </div>
              <p className="rounded-md bg-muted/60 p-2">
                {isFetching
                  ? "Contando…"
                  : contagem
                    ? `${contagem.total.toLocaleString("pt-BR")} pessoa(s) hoje, já sem descadastrados.`
                    : "—"}
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!ateIso || criar.isPending || contagem?.total === 0}
                onClick={() => criar.mutate()}
              >
                Criar campanha de reengajamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** No editor: escolher a campanha de origem, o critério e a data. */
export function QuemRecebeReengajamento({
  campanhaId,
  origem,
  criterio,
  ate,
  onChange,
}: {
  campanhaId: string;
  origem: string | null;
  criterio: Criterio;
  ate: string | null;
  onChange: (v: {
    origem_campanha_id: string | null;
    reengajar: Criterio;
    reengajar_ate: string | null;
  }) => void;
}) {
  const listarFn = useServerFn(listarCampanhas);
  const { data: campanhas } = useQuery({
    queryKey: ["email-mkt", "campanhas"],
    queryFn: () => listarFn(),
  });
  const enviadas = (campanhas ?? []).filter((c) => c.id !== campanhaId && c.metricas.enviados > 0);
  const { data: contagem, isFetching } = useContagemReengajamento(origem, criterio, ate);
  const muda = (
    p: Partial<{
      origem_campanha_id: string | null;
      reengajar: Criterio;
      reengajar_ate: string | null;
    }>,
  ) => onChange({ origem_campanha_id: origem, reengajar: criterio, reengajar_ate: ate, ...p });
  return (
    <div className="space-y-2">
      <select
        aria-label="Campanha de origem"
        className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
        value={origem ?? ""}
        onChange={(e) => muda({ origem_campanha_id: e.target.value || null })}
      >
        <option value="">Escolha a campanha enviada…</option>
        {enviadas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} ({c.metricas.enviados.toLocaleString("pt-BR")} enviados)
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-3">
        <EscolhaCriterio valor={criterio} onChange={(c) => muda({ reengajar: c })} />
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          até
          <Input
            type="datetime-local"
            className="h-8 w-[200px] text-[12px]"
            value={ate ? localInput(new Date(ate)) : ""}
            onChange={(e) => muda({ reengajar_ate: paraIso(e.target.value) })}
          />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {!origem
          ? "Vai só para quem recebeu a campanha escolhida e não abriu ou não clicou até a data."
          : isFetching
            ? "Contando…"
            : contagem
              ? `${contagem.total.toLocaleString("pt-BR")} pessoa(s) hoje, já sem descadastrados. Sem data, vale até a hora do envio.`
              : ""}
      </p>
    </div>
  );
}
