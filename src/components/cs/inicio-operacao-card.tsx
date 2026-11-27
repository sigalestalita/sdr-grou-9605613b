import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lerInicioOperacaoCs, salvarInicioOperacaoCs } from "@/lib/cs-inicio-operacao.functions";

/** Dia 1 do CS: antes desta data nada conta como atrasado. */
export function InicioOperacaoCard() {
  const lerFn = useServerFn(lerInicioOperacaoCs);
  const salvarFn = useServerFn(salvarInicioOperacaoCs);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["cs-inicio-operacao"], queryFn: () => lerFn() });
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setValor(data?.data ?? ""), [data?.data]);

  async function salvar() {
    setSalvando(true);
    try {
      await salvarFn({ data: { data: valor || null } });
      toast.success("Início da operação salvo");
      void qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Dia 1 do CS (início da operação)</p>
      <p className="max-w-[70ch] text-[12px] text-muted-foreground">
        Nada que venceu antes desta data aparece como atrasado (tarefas, escalações, alertas), e os
        prazos da etapa, de dias sem contato e da cadência contam a partir dela. O histórico de
        contatos não muda.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className="h-8 w-44"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={salvando || valor === (data?.data ?? "")}
          onClick={salvar}
        >
          Salvar data
        </Button>
      </div>
    </div>
  );
}
