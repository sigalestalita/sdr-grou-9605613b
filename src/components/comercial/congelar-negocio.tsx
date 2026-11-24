import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Snowflake } from "lucide-react";
import { congelarNegocio, MOTIVOS_CONGELAR } from "@/lib/comercial-negocio.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const dataBr = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const emMeses = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
};

/**
 * Congelar: o cliente decide depois do nosso ciclo. O negócio sai do funil
 * ativo e da previsão até a data e volta sozinho, com aviso e próximo passo.
 */
export function CongelarDialog({
  dealId,
  onClose,
  onDone,
}: {
  dealId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const fn = useServerFn(congelarNegocio);
  const [ate, setAte] = useState(emMeses(3));
  const [motivo, setMotivo] = useState<string>(MOTIVOS_CONGELAR[0]);
  const [detalhe, setDetalhe] = useState("");
  const salvar = useMutation({
    mutationFn: () =>
      fn({
        data: {
          dealId,
          ate,
          motivo: detalhe.trim() ? `${motivo} — ${detalhe.trim()}` : motivo,
        },
      }),
    onSuccess: () => {
      toast.success(`Negócio congelado até ${dataBr(ate)}`);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Congelar negócio</DialogTitle>
          <DialogDescription>
            Para quando o cliente só decide mais adiante. Não conta como perda: sai do funil ativo e
            da previsão, e volta para você na data, com aviso e próximo passo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="congelar-ate">Retomar em</Label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAte(emMeses(m))}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${
                    ate === emMeses(m)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === 12 ? "1 ano" : `${m} ${m === 1 ? "mês" : "meses"}`}
                </button>
              ))}
            </div>
            <Input
              id="congelar-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="congelar-motivo">Motivo</Label>
            <select
              id="congelar-motivo"
              className="h-9 w-full rounded-md border bg-background px-2 text-[13px]"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {MOTIVOS_CONGELAR.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Input
              aria-label="Detalhe do motivo"
              placeholder="Detalhe (ex.: orçamento de 2027 aprovado em março)"
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!ate || salvar.isPending} onClick={() => salvar.mutate()}>
            <Snowflake className="mr-1 h-3.5 w-3.5" />
            {salvar.isPending ? "Congelando…" : `Congelar até ${ate ? dataBr(ate) : "…"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Faixa no negócio congelado, com o motivo e o botão de retomar agora. */
export function FaixaCongelado({
  dealId,
  ate,
  motivo,
  onDone,
}: {
  dealId: string;
  ate: string;
  motivo: string | null;
  onDone: () => void;
}) {
  const fn = useServerFn(congelarNegocio);
  const retomar = useMutation({
    mutationFn: () => fn({ data: { dealId, ate: null } }),
    onSuccess: () => {
      toast.success("Negócio de volta ao funil");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-[13px]">
      <p className="flex items-start gap-2">
        <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span>
          <span className="font-medium">Congelado até {dataBr(ate)}</span>
          {motivo ? ` · ${motivo}` : ""}. Fora do funil ativo e da previsão; volta para você na
          data.
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={retomar.isPending}
        onClick={() => retomar.mutate()}
      >
        Retomar agora
      </Button>
    </section>
  );
}
